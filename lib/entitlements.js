const crypto = require('crypto');
const db = require('./db');
const { getPlanFeatures } = require('./planFeatures');
const { getCreditCost } = require('./creditCosts');
const { getBusinessPlanViaTeam, ensureBusinessTeam, applyPendingTeamInvite } = require('./teams');

const FREE_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT || '3', 10);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function hashIp(ip) {
  const salt = process.env.IP_HASH_SALT || 'writeflow';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

function getEffectivePlan(user) {
  if (!user) return 'anonymous';
  if (user.plan === 'business' || user.plan === 'pro') return user.plan;
  if (getBusinessPlanViaTeam(user.id)) return 'business';
  return user.plan || 'free';
}

function isPaidPlan(plan) {
  return plan === 'pro' || plan === 'business';
}

function getUsageSnapshot({ user, ip }) {
  const effectivePlan = getEffectivePlan(user);
  const features = getPlanFeatures(effectivePlan);
  const date = today();

  if (user && isPaidPlan(effectivePlan)) {
    return {
      isPro: true,
      plan: effectivePlan,
      ownPlan: user.plan,
      credits: user.credits,
      freeRemaining: FREE_LIMIT,
      freeUsed: 0,
      freeLimit: FREE_LIMIT,
      unlimited: true,
      features,
    };
  }

  if (user) {
    const row = db.prepare('SELECT count FROM daily_usage WHERE user_id = ? AND date = ?').get(user.id, date);
    const used = row?.count || 0;
    return {
      isPro: false,
      plan: effectivePlan,
      ownPlan: user.plan,
      credits: user.credits,
      freeRemaining: Math.max(0, FREE_LIMIT - used),
      freeUsed: used,
      freeLimit: FREE_LIMIT,
      unlimited: false,
      features,
    };
  }

  const ipHash = hashIp(ip || 'unknown');
  const row = db.prepare('SELECT count FROM anon_usage WHERE ip_hash = ? AND date = ?').get(ipHash, date);
  const used = row?.count || 0;
  return {
    isPro: false,
    plan: 'anonymous',
    ownPlan: null,
    credits: 0,
    freeRemaining: Math.max(0, FREE_LIMIT - used),
    freeUsed: used,
    freeLimit: FREE_LIMIT,
    unlimited: false,
    features: getPlanFeatures('anonymous'),
  };
}

function canGenerate({ user, ip, toolId, variants = 0 }) {
  const snap = getUsageSnapshot({ user, ip });
  const creditCost = variants === 3 ? 0 : getCreditCost(toolId);

  if (variants === 3) {
    const features = getPlanFeatures(snap.plan);
    if (snap.unlimited && features.bulkGeneration) {
      return { allowed: true, snap, useCredit: false, creditCost: 0 };
    }
    return { allowed: false, snap, useCredit: false, creditCost: 0 };
  }

  if (snap.unlimited) {
    return { allowed: true, snap, useCredit: false, creditCost };
  }

  if (snap.credits >= creditCost) {
    return { allowed: true, snap, useCredit: true, creditCost };
  }

  if (creditCost === 1 && snap.freeRemaining > 0) {
    return { allowed: true, snap, useCredit: false, creditCost };
  }

  if (snap.freeRemaining > 0 && creditCost > 1) {
    return {
      allowed: false,
      snap,
      useCredit: false,
      creditCost,
      needsCredits: true,
      message: `This template costs ${creditCost} credits. Free daily uses only cover 1-credit templates.`,
    };
  }

  return {
    allowed: false,
    snap,
    useCredit: false,
    creditCost,
    message: creditCost > 1
      ? `This template costs ${creditCost} credits. Buy a credit pack or upgrade to Pro for unlimited.`
      : undefined,
  };
}

function recordUsage({ user, ip, useCredit, creditCost = 1 }) {
  const date = today();
  const effectivePlan = getEffectivePlan(user);

  if (user) {
    if (isPaidPlan(effectivePlan)) return getUserByIdFresh(user.id);
    if (useCredit) {
      db.prepare('UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?')
        .run(creditCost, user.id, creditCost);
      return getUserByIdFresh(user.id);
    }
    db.prepare(`
      INSERT INTO daily_usage (user_id, date, count) VALUES (?, ?, 1)
      ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1
    `).run(user.id, date);
    return getUserByIdFresh(user.id);
  }

  const ipHash = hashIp(ip || 'unknown');
  db.prepare(`
    INSERT INTO anon_usage (ip_hash, date, count) VALUES (?, ?, 1)
    ON CONFLICT(ip_hash, date) DO UPDATE SET count = count + 1
  `).run(ipHash, date);
  return null;
}

function getUserByIdFresh(id) {
  return db.prepare('SELECT id, email, name, plan, credits, created_at FROM users WHERE id = ?').get(id);
}

function grantPlan(email, plan) {
  const normalized = email.trim().toLowerCase();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(normalized);
  if (user) {
    db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, user.id);
    if (plan === 'business') ensureBusinessTeam(user.id);
    return;
  }
  db.prepare(`
    INSERT INTO pending_entitlements (email, plan, credits_add, updated_at)
    VALUES (?, ?, 0, ?)
    ON CONFLICT(email) DO UPDATE SET plan = excluded.plan, updated_at = excluded.updated_at
  `).run(normalized, plan, Date.now());
}

function grantCredits(email, amount) {
  const normalized = email.trim().toLowerCase();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(normalized);
  if (user) {
    db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(amount, user.id);
    return;
  }
  db.prepare(`
    INSERT INTO pending_entitlements (email, plan, credits_add, updated_at)
    VALUES (?, NULL, ?, ?)
    ON CONFLICT(email) DO UPDATE SET credits_add = credits_add + excluded.credits_add, updated_at = excluded.updated_at
  `).run(normalized, amount, Date.now());
}

function onUserSession(user) {
  if (!user) return user;
  applyPendingTeamInvite(user.email);
  if (user.plan === 'business') ensureBusinessTeam(user.id);
  return getUserByIdFresh(user.id);
}

module.exports = {
  FREE_LIMIT,
  getEffectivePlan,
  getUsageSnapshot,
  canGenerate,
  recordUsage,
  grantPlan,
  grantCredits,
  isPaidPlan,
  onUserSession,
  getCreditCost,
};