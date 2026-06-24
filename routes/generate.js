const express = require('express');
const { canGenerate, recordUsage, getEffectivePlan } = require('../lib/entitlements');
const { getPlanFeatures } = require('../lib/planFeatures');
const { streamGeneration, saveGenerationHistory } = require('../lib/generateCore');

const router = express.Router();

const MAX_PROMPT_LENGTH = parseInt(process.env.MAX_PROMPT_LENGTH || '12000', 10);

router.post('/', async (req, res) => {
  const { prompt, toolId, toolName, tone, variants } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI service unavailable' });
  }
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'No prompt provided' });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(400).json({ error: `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)` });
  }

  const plan = getEffectivePlan(req.user);
  const features = getPlanFeatures(plan);

  if (variants === 3 && !features.bulkGeneration) {
    return res.status(403).json({ error: 'Bulk generation (3 variants) requires Business plan', upgrade: true });
  }

  const check = canGenerate({
    user: req.user,
    ip: req.ip,
    toolId,
    variants: variants === 3 ? 3 : 0,
  });
  if (!check.allowed) {
    return res.status(429).json({
      error: 'Limit reached',
      upgrade: true,
      creditCost: check.creditCost,
      message: check.message || (req.user
        ? 'You have used your free generations for today. Upgrade to Pro or buy credits.'
        : 'Sign in or upgrade to continue. Anonymous users get 3 free generations per day.'),
      usage: check.snap,
    });
  }

  try {
    res.setHeader('X-Usage-Mode', check.useCredit ? 'credit' : check.snap.unlimited ? 'paid' : 'free');
    res.setHeader('X-Credit-Cost', String(check.creditCost || 0));

    const output = await streamGeneration({
      user: req.user,
      prompt,
      toolId,
      toolName,
      tone,
      variants: variants === 3 ? 3 : 0,
      res,
    });

    if (output?.trim()) {
      recordUsage({
        user: req.user,
        ip: req.ip,
        useCredit: check.useCredit,
        creditCost: check.creditCost,
      });
      saveGenerationHistory(req.user, { toolId, toolName, tone, output });
    }
  } catch (err) {
    console.error('Generate error:', err);
    if (!res.headersSent) {
      res.status(err.status || 500).json({ error: err.message, detail: err.detail });
    } else {
      res.end();
    }
  }
});

module.exports = router;