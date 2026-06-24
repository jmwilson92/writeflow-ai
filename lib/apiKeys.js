const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const MAX_KEYS = 3;
const PREFIX = 'wf_';

function hashKey(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function createApiKey(userId) {
  const count = db.prepare('SELECT COUNT(*) as c FROM api_keys WHERE user_id = ?').get(userId).c;
  if (count >= MAX_KEYS) {
    throw Object.assign(new Error(`Maximum ${MAX_KEYS} API keys allowed`), { status: 400 });
  }

  const raw = PREFIX + crypto.randomBytes(24).toString('hex');
  const id = uuidv4();
  const now = Date.now();

  db.prepare(`
    INSERT INTO api_keys (id, user_id, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, hashKey(raw), raw.slice(0, 12) + '…', now);

  return { id, key: raw, prefix: raw.slice(0, 12) + '…', created_at: now };
}

function listApiKeys(userId) {
  return db.prepare(`
    SELECT id, key_prefix, created_at, last_used_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId);
}

function revokeApiKey(userId, keyId) {
  const result = db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(keyId, userId);
  if (result.changes === 0) throw Object.assign(new Error('API key not found'), { status: 404 });
}

function resolveApiKeyUser(authorization) {
  if (!authorization?.startsWith('Bearer ')) return null;
  const raw = authorization.slice(7).trim();
  if (!raw.startsWith(PREFIX)) return null;

  const row = db.prepare(`
    SELECT k.id, k.user_id, u.id as uid, u.email, u.name, u.plan, u.credits, u.created_at
    FROM api_keys k JOIN users u ON k.user_id = u.id
    WHERE k.key_hash = ?
  `).get(hashKey(raw));

  if (!row) return null;

  db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(Date.now(), row.id);

  return {
    id: row.uid,
    email: row.email,
    name: row.name,
    plan: row.plan,
    credits: row.credits,
    created_at: row.created_at,
  };
}

module.exports = { createApiKey, listApiKeys, revokeApiKey, resolveApiKeyUser, MAX_KEYS };