const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { getEffectivePlan } = require('../lib/entitlements');
const { getPlanFeatures } = require('../lib/planFeatures');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  if (!getPlanFeatures(getEffectivePlan(req.user)).outputHistory) {
    return res.status(403).json({ error: 'Output history requires Pro or Business plan' });
  }

  const rows = db.prepare(`
    SELECT id, tool_id, tool_name, tone, output, word_count, created_at
    FROM generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(req.user.id);

  res.json({ history: rows });
});

router.delete('/:id', requireAuth, (req, res) => {
  if (!getPlanFeatures(getEffectivePlan(req.user)).outputHistory) {
    return res.status(403).json({ error: 'Pro plan required' });
  }
  const result = db.prepare('DELETE FROM generations WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;