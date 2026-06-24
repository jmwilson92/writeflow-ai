const express = require('express');
const { requireAuth } = require('../lib/auth');
const { getEffectivePlan } = require('../lib/entitlements');
const { getPlanFeatures } = require('../lib/planFeatures');
const { createApiKey, listApiKeys, revokeApiKey } = require('../lib/apiKeys');

const router = express.Router();

function requireApiAccess(req, res, next) {
  const plan = getEffectivePlan(req.user);
  if (!getPlanFeatures(plan).apiAccess) {
    return res.status(403).json({ error: 'API access requires Business plan' });
  }
  next();
}

router.get('/', requireAuth, requireApiAccess, (req, res) => {
  res.json({ keys: listApiKeys(req.user.id) });
});

router.post('/', requireAuth, requireApiAccess, (req, res) => {
  try {
    const key = createApiKey(req.user.id);
    res.json({ key, message: 'Copy this key now — it will not be shown again.' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, requireApiAccess, (req, res) => {
  try {
    revokeApiKey(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;