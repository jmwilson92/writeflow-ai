const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { onUserSession } = require('./entitlements');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-in-production';
const COOKIE_NAME = 'wf_session';
const TOKEN_TTL = '30d';

function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function getUserById(id) {
  return db.prepare('SELECT id, email, name, plan, credits, created_at FROM users WHERE id = ?').get(id);
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
}

function applyPendingEntitlements(email) {
  const pending = db.prepare('SELECT * FROM pending_entitlements WHERE email = ?').get(email.trim().toLowerCase());
  if (!pending) return null;

  const user = getUserByEmail(email);
  if (!user) return pending;

  if (pending.plan && pending.plan !== 'free') {
    db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(pending.plan, user.id);
  }
  if (pending.credits_add > 0) {
    db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(pending.credits_add, user.id);
  }
  db.prepare('DELETE FROM pending_entitlements WHERE email = ?').run(email.trim().toLowerCase());
  return getUserById(user.id);
}

async function registerUser({ email, password, name }) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw Object.assign(new Error('Valid email required'), { status: 400 });
  }
  if (!password || password.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters'), { status: 400 });
  }
  if (getUserByEmail(normalized)) {
    throw Object.assign(new Error('Email already registered'), { status: 409 });
  }

  const id = uuidv4();
  const passwordHash = await hashPassword(password);
  const now = Date.now();

  db.prepare(
    'INSERT INTO users (id, email, password_hash, name, plan, credits, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, normalized, passwordHash, name?.trim() || null, 'free', 0, now);

  applyPendingEntitlements(normalized);
  return onUserSession(getUserById(id));
}

async function loginUser({ email, password }) {
  const user = getUserByEmail(email);
  if (!user) throw Object.assign(new Error('Invalid email or password'), { status: 401 });
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw Object.assign(new Error('Invalid email or password'), { status: 401 });
  applyPendingEntitlements(user.email);
  return onUserSession(getUserById(user.id));
}

function authMiddleware(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    req.user = null;
    return next();
  }
  const payload = verifyToken(token);
  if (!payload) {
    req.user = null;
    return next();
  }
  let user = getUserById(payload.sub);
  if (user) user = onUserSession(user);
  req.user = user || null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
  });
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    credits: user.credits,
    isPro: user.plan === 'pro' || user.plan === 'business',
  };
}

module.exports = {
  COOKIE_NAME,
  registerUser,
  loginUser,
  authMiddleware,
  requireAuth,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  publicUser,
  getUserById,
  getUserByEmail,
  applyPendingEntitlements,
};