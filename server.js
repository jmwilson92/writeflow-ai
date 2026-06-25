require('dotenv').config({ override: process.env.NODE_ENV !== 'production' });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

require('./lib/db');
const { authMiddleware } = require('./lib/auth');

const authRoutes = require('./routes/auth');
const generateRoutes = require('./routes/generate');
const historyRoutes = require('./routes/history');
const presetsRoutes = require('./routes/presets');
const configRoutes = require('./routes/config');
const stripeRoutes = require('./routes/stripe');
const devRoutes = require('./routes/dev');
const parseRoutes = require('./routes/parse');
const teamRoutes = require('./routes/team');
const keysRoutes = require('./routes/keys');
const v1Routes = require('./routes/v1');
const billingRoutes = require('./routes/billing');
const { getEffectivePlan, isPaidPlan } = require('./lib/entitlements');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

function getAllowedOrigins() {
  const fromEnv = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const auto = [process.env.RENDER_EXTERNAL_URL, process.env.APP_URL]
    .filter(Boolean)
    .map(s => s.replace(/\/$/, ''));
  return [...new Set([...fromEnv, ...auto])];
}

const allowedOrigins = getAllowedOrigins();
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

const stripeWebhookRaw = express.raw({ type: 'application/json' });
app.get('/api/webhooks/stripe', (req, res) => {
  res.json({ ok: true, message: 'Stripe webhook endpoint — Stripe must send POST requests here.' });
});
app.use('/api/webhooks/stripe', stripeWebhookRaw, stripeRoutes);
// Fallback when Stripe dashboard URL is set to site root (missing /api/webhooks/stripe path)
app.post('/', stripeWebhookRaw, (req, res, next) => {
  if (req.headers['stripe-signature']) return stripeRoutes(req, res, next);
  next();
});

app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());
app.use(authMiddleware);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PER_MIN || '30', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.GENERATE_LIMIT_PER_MIN || '10', 10),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isPaidPlan(getEffectivePlan(req.user)),
  message: { error: 'Generation rate limit exceeded. Upgrade for priority processing.' },
});

app.use('/api', apiLimiter);
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    stripe: !!process.env.STRIPE_SECRET_KEY,
    stripeWebhook: !!process.env.STRIPE_WEBHOOK_SECRET,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/generate', generateLimiter, generateRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/presets', presetsRoutes);
app.use('/api/config', configRoutes);
app.use('/api/dev', devRoutes);
app.use('/api/parse', apiLimiter, parseRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/keys', keysRoutes);
app.use('/api/v1', v1Routes);
app.use('/api/billing', billingRoutes);

// Page routes (before static — avoids 404 on /api-docs etc.)
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'terms.html')));
app.get('/api-docs', (req, res) => res.sendFile(path.join(__dirname, 'api-docs.html')));

const BLOCKED_PREFIXES = ['/lib', '/routes', '/data', '/node_modules', '/.git'];
app.use((req, res, next) => {
  if (BLOCKED_PREFIXES.some(p => req.path.startsWith(p)) || req.path === '/server.js' || req.path === '/package.json') {
    return res.status(404).end();
  }
  next();
});

app.use(express.static(path.join(__dirname), {
  index: 'index.html',
  dotfiles: 'ignore',
}));

app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS blocked' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large (max 5 MB)' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('\n⚠️  WARNING: ANTHROPIC_API_KEY is not set — generation will fail.\n');
}
if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-only-change-in-production')) {
  console.warn('⚠️  WARNING: Set a strong JWT_SECRET in production.\n');
}

const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`
  ✦ Sparknous — production server
  → Listening on ${HOST}:${PORT}
  → Health: /health
  → Mode: ${isProd ? 'production' : 'development'}
  → API key: ${process.env.ANTHROPIC_API_KEY ? '✓' : '✗'}
  → Node: ${process.version}
  `);
});