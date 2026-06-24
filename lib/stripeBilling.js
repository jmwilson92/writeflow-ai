const { grantPlan, grantCredits } = require('./entitlements');

const CREDIT_PACKS = {
  'pack-50': 50,
  'pack-200': 200,
  'pack-500': 500,
  'pack-1000': 1000,
};

function resolvePlanMetadata(plan) {
  if (!plan) return null;
  if (plan === 'pro' || plan === 'pro-annual') return 'pro';
  if (plan === 'business' || plan === 'business-annual') return 'business';
  return null;
}

function sessionEmail(session) {
  return (session.customer_details?.email || session.customer_email || '').trim().toLowerCase();
}

async function applyCheckoutSession(stripe, session) {
  const email = sessionEmail(session);
  if (!email) return null;

  let planKey = session.metadata?.plan;

  if (!planKey && session.mode === 'subscription' && session.subscription && stripe) {
    try {
      const sub = await stripe.subscriptions.retrieve(session.subscription);
      planKey = sub.metadata?.plan;
    } catch (err) {
      console.warn('Could not load subscription metadata:', err.message);
    }
  }

  const mapped = resolvePlanMetadata(planKey);
  if (mapped) {
    grantPlan(email, mapped);
    return { type: 'plan', plan: mapped, email };
  }

  if (planKey && CREDIT_PACKS[planKey]) {
    grantCredits(email, CREDIT_PACKS[planKey]);
    return { type: 'credits', credits: CREDIT_PACKS[planKey], email };
  }

  return null;
}

async function syncEntitlementsForEmail(stripe, email) {
  const normalized = email.trim().toLowerCase();
  if (!stripe || !normalized) {
    return { ok: false, message: 'Stripe not configured or invalid email' };
  }

  const sessions = await stripe.checkout.sessions.list({ limit: 25, status: 'complete' });
  for (const session of sessions.data) {
    if (sessionEmail(session) !== normalized) continue;
    const applied = await applyCheckoutSession(stripe, session);
    if (applied) {
      return { ok: true, ...applied, source: 'checkout_session' };
    }
  }

  const customers = await stripe.customers.list({ email: normalized, limit: 5 });
  for (const customer of customers.data) {
    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 10,
    });
    for (const sub of subs.data) {
      const mapped = resolvePlanMetadata(sub.metadata?.plan);
      if (mapped) {
        grantPlan(normalized, mapped);
        return { ok: true, type: 'plan', plan: mapped, email: normalized, source: 'subscription' };
      }
    }
  }

  return {
    ok: false,
    message: 'No completed Stripe payment found for this email. Checkout with the same email as your WriteFlow account, then try again.',
  };
}

module.exports = {
  CREDIT_PACKS,
  resolvePlanMetadata,
  applyCheckoutSession,
  syncEntitlementsForEmail,
};