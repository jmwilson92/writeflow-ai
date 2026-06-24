const express = require('express');
const { requireAuth, getUserById, publicUser } = require('../lib/auth');
const { getUsageSnapshot } = require('../lib/entitlements');
const { syncEntitlementsForEmail } = require('../lib/stripeBilling');

const router = express.Router();
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? require('stripe')(stripeSecret) : null;

router.post('/sync', requireAuth, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured on the server' });
  }

  try {
    const result = await syncEntitlementsForEmail(stripe, req.user.email);
    const user = getUserById(req.user.id);
    const usage = getUsageSnapshot({ user, ip: req.ip });
    res.json({
      ...result,
      user: publicUser(user),
      usage,
    });
  } catch (err) {
    console.error('Billing sync error:', err);
    res.status(500).json({ error: err.message || 'Could not sync with Stripe' });
  }
});

module.exports = router;