const express = require('express');
const { requireAuth } = require('../lib/auth');
const db = require('../lib/db');

const router = express.Router();

const allowDemo = process.env.ALLOW_DEMO_CHECKOUT === 'true' && process.env.NODE_ENV !== 'production';

router.use((req, res, next) => {
  if (!allowDemo) return res.status(404).json({ error: 'Not found' });
  next();
});

router.post('/checkout', requireAuth, (req, res) => {
  const { plan } = req.body;
  const creditPacks = { 'pack-50': 50, 'pack-200': 200, 'pack-500': 500, 'pack-1000': 1000 };

  if (plan === 'pro' || plan === 'business') {
    db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, req.user.id);
    if (plan === 'business') require('../lib/teams').ensureBusinessTeam(req.user.id);
  } else if (creditPacks[plan]) {
    db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(creditPacks[plan], req.user.id);
  } else {
    return res.status(400).json({ error: 'Unknown plan' });
  }

  const user = db.prepare('SELECT id, email, name, plan, credits, created_at FROM users WHERE id = ?').get(req.user.id);
  const { getUsageSnapshot } = require('../lib/entitlements');
  const { publicUser } = require('../lib/auth');

  res.json({
    user: publicUser(user),
    usage: getUsageSnapshot({ user, ip: req.ip }),
    demo: true,
  });
});

module.exports = router;