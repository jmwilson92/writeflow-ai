const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { getEffectivePlan } = require('../lib/entitlements');
const { getPlanFeatures } = require('../lib/planFeatures');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const features = getPlanFeatures(getEffectivePlan(req.user));
  if (!features.tonePresetLimit) {
    return res.status(403).json({ error: 'Tone presets require Pro or Business plan' });
  }
  const presets = db.prepare(
    'SELECT id, name, value, created_at FROM tone_presets WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.id);
  res.json({ presets, limit: features.tonePresetLimit });
});

router.post('/', requireAuth, (req, res) => {
  const features = getPlanFeatures(getEffectivePlan(req.user));
  if (!features.tonePresetLimit) {
    return res.status(403).json({ error: 'Tone presets require Pro or Business plan' });
  }

  const { name, value } = req.body;
  if (!name?.trim() || !value?.trim()) {
    return res.status(400).json({ error: 'Name and value required' });
  }

  if (features.tonePresetLimit > 0) {
    const count = db.prepare('SELECT COUNT(*) as c FROM tone_presets WHERE user_id = ?').get(req.user.id).c;
    if (count >= features.tonePresetLimit) {
      return res.status(400).json({ error: `Maximum ${features.tonePresetLimit} tone presets on your plan` });
    }
  }

  const id = uuidv4();
  db.prepare(
    'INSERT INTO tone_presets (id, user_id, name, value, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.user.id, name.trim(), value.trim(), Date.now());

  res.json({ preset: { id, name: name.trim(), value: value.trim() } });
});

router.delete('/:id', requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM tone_presets WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;