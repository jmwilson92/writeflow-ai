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

function inferPlanFromLabel(label) {
  const text = (label || '').toLowerCase();
  if (text.includes('business')) return 'business';
  if (text.includes('pro')) return 'pro';
  return null;
}

function inferCreditPackFromLabel(label) {
  const text = (label || '').toLowerCase();
  if (text.includes('1000')) return 'pack-1000';
  if (text.includes('500')) return 'pack-500';
  if (text.includes('200')) return 'pack-200';
  if (text.includes('50')) return 'pack-50';
  return null;
}

async function productLabel(stripe, price) {
  if (!price) return '';
  let label = price.nickname || '';
  const productRef = price.product;
  if (!productRef) return label;
  try {
    const product = typeof productRef === 'object'
      ? productRef
      : await stripe.products.retrieve(productRef);
    label = `${label} ${product.name || ''}`.trim();
  } catch { /* ignore */ }
  return label;
}

async function inferPlanFromSubscription(stripe, sub) {
  const fromMeta = resolvePlanMetadata(sub.metadata?.plan);
  if (fromMeta) return fromMeta;

  const priceIds = {
    pro: (process.env.STRIPE_PRICE_PRO || '').split(',').map(s => s.trim()).filter(Boolean),
    business: (process.env.STRIPE_PRICE_BUSINESS || '').split(',').map(s => s.trim()).filter(Boolean),
  };

  for (const item of sub.items?.data || []) {
    const priceId = item.price?.id;
    if (priceId && priceIds.pro.includes(priceId)) return 'pro';
    if (priceId && priceIds.business.includes(priceId)) return 'business';
    const label = await productLabel(stripe, item.price);
    const inferred = inferPlanFromLabel(label);
    if (inferred) return inferred;
  }
  return null;
}

async function searchCheckoutSessionsByEmail(stripe, email) {
  try {
    const result = await stripe.checkout.sessions.search({
      query: `customer_details.email:'${email}' AND status:'complete'`,
      limit: 10,
    });
    return result.data;
  } catch (err) {
    console.warn('Checkout session search unavailable, using list fallback:', err.message);
    const sessions = await stripe.checkout.sessions.list({ limit: 100, status: 'complete' });
    return sessions.data.filter((s) => sessionEmail(s) === email);
  }
}

async function applyCheckoutSession(stripe, session) {
  const email = sessionEmail(session);
  if (!email) return null;

  let planKey = session.metadata?.plan;

  if (session.mode === 'subscription' && session.subscription && stripe) {
    try {
      const sub = await stripe.subscriptions.retrieve(session.subscription, {
        expand: ['items.data.price.product'],
      });
      if (!planKey) planKey = sub.metadata?.plan;
      const inferred = await inferPlanFromSubscription(stripe, sub);
      if (inferred) {
        grantPlan(email, inferred);
        return { type: 'plan', plan: inferred, email, inferred: !resolvePlanMetadata(planKey) };
      }
    } catch (err) {
      console.warn('Could not load subscription:', err.message);
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

  if (session.mode === 'payment' && stripe) {
    try {
      const full = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items.data.price.product'],
      });
      for (const item of full.line_items?.data || []) {
        const label = `${item.description || ''} ${await productLabel(stripe, item.price)}`;
        const pack = inferCreditPackFromLabel(label);
        if (pack && CREDIT_PACKS[pack]) {
          grantCredits(email, CREDIT_PACKS[pack]);
          return { type: 'credits', credits: CREDIT_PACKS[pack], email, inferred: true };
        }
      }
    } catch (err) {
      console.warn('Could not load checkout line items:', err.message);
    }
  }

  return null;
}

async function syncEntitlementsForEmail(stripe, email) {
  const normalized = email.trim().toLowerCase();
  if (!stripe || !normalized) {
    return { ok: false, message: 'Stripe not configured or invalid email' };
  }

  const sessions = await searchCheckoutSessionsByEmail(stripe, normalized);
  for (const session of sessions) {
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
      expand: ['data.items.data.price.product'],
    });
    for (const sub of subs.data) {
      const mapped = await inferPlanFromSubscription(stripe, sub);
      if (mapped) {
        grantPlan(normalized, mapped);
        return { ok: true, type: 'plan', plan: mapped, email: normalized, source: 'subscription' };
      }
    }
  }

  const mode = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'live' : 'test';
  return {
    ok: false,
    message: `No completed Stripe payment found for ${normalized}.`,
    hint: `Use the same email at checkout as your Sparknous login. Stripe mode on server: ${mode}. If you paid before adding metadata, try again after deploy — or contact support with your Stripe receipt email.`,
  };
}

module.exports = {
  CREDIT_PACKS,
  resolvePlanMetadata,
  applyCheckoutSession,
  syncEntitlementsForEmail,
};