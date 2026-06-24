const express = require('express');
const {
  CREDIT_PACKS,
  resolvePlanMetadata,
  applyCheckoutSession,
} = require('../lib/stripeBilling');
const { grantPlan } = require('../lib/entitlements');

const router = express.Router();

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = stripeSecret ? require('stripe')(stripeSecret) : null;

async function customerEmailFromId(customerId) {
  if (!stripe || !customerId || typeof customerId !== 'string') return null;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return customer.email?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

router.post('/', async (req, res) => {
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
      const applied = await applyCheckoutSession(stripe, session);
      if (applied) {
        console.log(`✓ Checkout applied: ${applied.email} → ${applied.type}`, applied);
      } else {
        const email = session.customer_details?.email || session.customer_email;
        console.warn('Checkout completed but no plan/credits applied', {
          email,
          metadata: session.metadata,
        });
      }
    }

    if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      const email = sub.customer_email || await customerEmailFromId(sub.customer);
      const planMeta = sub.metadata?.plan;

      if (email && event.type === 'customer.subscription.deleted') {
        grantPlan(email, 'free');
        console.log(`✓ Subscription ended: ${email}`);
      } else if (email && sub.status === 'active') {
        const mapped = resolvePlanMetadata(planMeta);
        if (mapped) {
          grantPlan(email, mapped);
          console.log(`✓ Subscription active: ${email} → ${mapped}`);
        }
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  res.json({ received: true });
});

module.exports = router;