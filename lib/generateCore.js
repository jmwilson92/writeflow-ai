const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { getEffectivePlan } = require('./entitlements');
const { getPlanFeatures } = require('./planFeatures');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const STYLE_RULES = `WRITING STYLE (required):
- Do not use em dashes (—) or en dashes (–). Use commas, periods, or colons instead.
- Do not overuse hyphens or dash-heavy sentence structures.
- Write clean, natural prose without filler phrases like "In today's world" or "It's worth noting."`;

const VARIANT_ANGLES = [
  'Take a direct, professional angle. Deliver ONE complete version only. No version labels or meta commentary.',
  'Take a warmer, more personable angle. Deliver ONE complete version only. No version labels or meta commentary.',
  'Take a bold, distinctive angle. Deliver ONE complete version only. No version labels or meta commentary.',
];

function applyStyleRules(prompt) {
  return `${prompt}\n\n${STYLE_RULES}`;
}

function sendSseJson(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function parseAnthropicDelta(line) {
  if (!line.startsWith('data: ')) return null;
  const data = line.slice(6).trim();
  if (!data || data === '[DONE]') return null;
  try {
    const event = JSON.parse(data);
    if (event.type === 'content_block_delta' && event.delta?.text) {
      return event.delta.text;
    }
  } catch { /* ignore */ }
  return null;
}

async function callAnthropicStream({ prompt, maxTokens }) {
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    let message = 'AI service error';
    try {
      const parsed = JSON.parse(err);
      const type = parsed?.error?.type;
      if (type === 'authentication_error') {
        message = 'Invalid Claude API key — check ANTHROPIC_API_KEY in .env and restart the server';
      } else if (parsed?.error?.message) {
        message = parsed.error.message;
      }
    } catch { /* keep default */ }
    throw Object.assign(new Error(message), { status: 502, detail: err });
  }

  return anthropicRes;
}

async function readAnthropicStream(anthropicRes, { onRawChunk, onText }) {
  const reader = anthropicRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullOutput = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    if (onRawChunk) onRawChunk(chunk);

    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const text = parseAnthropicDelta(line);
      if (text) {
        fullOutput += text;
        if (onText) onText(text);
      }
    }
  }

  return fullOutput;
}

async function streamBulkVariants({ user, prompt, res }) {
  const effectivePlan = getEffectivePlan(user);
  const features = getPlanFeatures(effectivePlan);
  const styledBase = applyStyleRules(prompt);
  const outputs = [];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Stream-Format', 'variants');
  res.setHeader('X-Plan-Tier', effectivePlan);
  res.setHeader('X-Priority', 'true');

  for (let i = 0; i < 3; i++) {
    sendSseJson(res, { type: 'variant_start', index: i, label: `Variant ${i + 1}` });

    const variantPrompt = `${styledBase}\n\n${VARIANT_ANGLES[i]}`;
    const anthropicRes = await callAnthropicStream({
      prompt: variantPrompt,
      maxTokens: features.maxOutputTokens,
    });

    const output = await readAnthropicStream(anthropicRes, {
      onText: (text) => sendSseJson(res, { type: 'delta', index: i, text }),
    });

    outputs.push(output);
    sendSseJson(res, { type: 'variant_end', index: i });
  }

  res.write('data: [DONE]\n\n');
  res.end();
  return outputs;
}

async function streamGeneration({ user, prompt, toolId, toolName, tone, variants, res }) {
  const effectivePlan = getEffectivePlan(user);
  const features = getPlanFeatures(effectivePlan);

  if (variants === 3) {
    return streamBulkVariants({ user, prompt, res });
  }

  const finalPrompt = applyStyleRules(prompt);
  const anthropicRes = await callAnthropicStream({
    prompt: finalPrompt,
    maxTokens: features.maxOutputTokens,
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Plan-Tier', effectivePlan);
  res.setHeader('X-Priority', features.priorityProcessing ? 'true' : 'false');

  const fullOutput = await readAnthropicStream(anthropicRes, {
    onRawChunk: (chunk) => res.write(chunk),
  });

  res.end();
  return fullOutput;
}

function saveGenerationHistory(user, { toolId, toolName, tone, output }) {
  if (!user || !output?.trim()) return;
  const effectivePlan = getEffectivePlan(user);
  const features = getPlanFeatures(effectivePlan);
  if (!features.outputHistory) return;

  const wordCount = output.split(/\s+/).filter(Boolean).length;
  db.prepare(`
    INSERT INTO generations (id, user_id, tool_id, tool_name, tone, output, word_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), user.id, toolId || null, toolName || null, tone || null, output, wordCount, Date.now());
}

module.exports = { streamGeneration, saveGenerationHistory, applyStyleRules };