const express = require('express');
const { resolveApiKeyUser } = require('../lib/apiKeys');
const { canGenerate, recordUsage, getEffectivePlan } = require('../lib/entitlements');
const { getPlanFeatures } = require('../lib/planFeatures');
const { streamGeneration, saveGenerationHistory } = require('../lib/generateCore');

const router = express.Router();
const MAX_PROMPT_LENGTH = parseInt(process.env.MAX_PROMPT_LENGTH || '12000', 10);

router.use((req, res, next) => {
  const user = resolveApiKeyUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Invalid or missing API key. Use Authorization: Bearer sn_...' });
  req.user = user;
  next();
});

router.post('/generate', async (req, res) => {
  const { prompt, toolId, toolName, tone } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI service unavailable' });
  }
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required' });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(400).json({ error: `Prompt too long (max ${MAX_PROMPT_LENGTH})` });
  }

  const plan = getEffectivePlan(req.user);
  if (!getPlanFeatures(plan).apiAccess) {
    return res.status(403).json({ error: 'API access requires Business plan' });
  }

  const check = canGenerate({ user: req.user, ip: req.ip, toolId });
  if (!check.allowed) {
    return res.status(429).json({
      error: 'Generation limit reached',
      creditCost: check.creditCost,
      message: check.message,
      usage: check.snap,
    });
  }

  try {
    const output = await streamGeneration({
      user: req.user,
      prompt,
      toolId,
      toolName,
      tone,
      variants: 0,
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
    if (!res.headersSent) {
      res.status(err.status || 500).json({ error: err.message, detail: err.detail });
    }
  }
});

module.exports = router;