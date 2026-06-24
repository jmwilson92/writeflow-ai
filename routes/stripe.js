const express = require('express');
const { grantPlan, grantCredits } = require('../lib/entitlements');

const router = express.Router();

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = stripeSecret ? require('stripe')(stripeSecret) : null;

const CREDIT_PACKS = {
  'pack-50': 50,
  'pack-200': 200,
  'pack-500': 500,
  'pack-1000': 1000,
};

function planFromMetadata(plan) {
  if (plan === 'pro' || plan === 'business') return plan;
  if (CREDIT_PACKS[plan]) return null;
  return null;
}

router.post('/', (req, res) => {
  if (!stripe || !webhookSecret) {
    return res.status(503).send('Stripe not configured');
  }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_details?.email || session.customer_email;
      const plan = session.metadata?.plan;

      if (!email) {
        console.warn('Checkout completed without email');
      } else if (plan) {
        const mapped = planFromMetadata(plan);
        if (mapped) {
          grantPlan(email, mapped);
          console.log(`✓ Plan granted: ${email} → ${mapped}`);
        } else if (CREDIT_PACKS[plan]) {
          grantCredits(email, CREDIT_PACKS[plan]);
          console.log(`✓ Credits granted: ${email} → +${CREDIT_PACKS[plan]}`);
        }
      }
    }

    if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      const email = sub.customer_email;
      const planMeta = sub.metadata?.plan;
      if (email && event.type === 'customer.subscription.deleted') {
        grantPlan(email, 'free');
        console.log(`✓ Subscription ended: ${email}`);
      } else if (email && planMeta && sub.status === 'active') {
        const mapped = planFromMetadata(planMeta);
        if (mapped) grantPlan(email, mapped);
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  res.json({ received: true });
});

module.exports = router;