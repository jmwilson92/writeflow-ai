// ============================================================
// WriteFlow AI — Backend Server
// Keeps your Claude API key secret from users
// ============================================================
// Setup: npm install express cors dotenv
// Run:   node server.js
// ============================================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();   // Loads .env file automatically if present

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));  // Serves index.html

// ============================================================
// CLAUDE API KEY (loaded from environment variable or .env file)
// ============================================================
// Create a .env file in this folder with:
//   ANTHROPIC_API_KEY=sk-ant-your-new-key-here
//
// .env is gitignored, so it's safe and never committed.
// This is the easiest way to test locally.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('\n❌ FATAL: ANTHROPIC_API_KEY is not set!');
  console.error('   Create a .env file with: ANTHROPIC_API_KEY=your-key\n');
  // process.exit(1);
}

// ============================================================
// RATE LIMITING (basic — use Redis in production)
// ============================================================
const usageMap = {}; // ip -> { count, date }
const FREE_LIMIT = 3;

function checkRateLimit(ip) {
  const today = new Date().toDateString();
  if (!usageMap[ip] || usageMap[ip].date !== today) {
    usageMap[ip] = { count: 0, date: today };
  }
  return usageMap[ip].count < FREE_LIMIT;
}

function incrementUsage(ip) {
  usageMap[ip].count++;
}

// ============================================================
// GENERATE ENDPOINT
// ============================================================
app.post('/api/generate', async (req, res) => {
  const { prompt, isPro, credits } = req.body;
  const ip = req.ip;

  if (!prompt) {
    return res.status(400).json({ error: 'No prompt provided' });
  }

  // Check limits for free users
  if (!isPro && !credits) {
    if (!checkRateLimit(ip)) {
      return res.status(429).json({
        error: 'Free limit reached',
        upgrade: true,
        message: 'You have used your 3 free generations today. Upgrade to Pro or buy credits.'
      });
    }
  }

  try {
    // Forward to Anthropic with streaming
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      return res.status(500).json({ error: 'Claude API error', detail: err });
    }

    // Track usage for free users
    if (!isPro && !credits) incrementUsage(ip);

    // Stream response back to client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = anthropicRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value));
    }

    res.end();

  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// STRIPE WEBHOOK (for auto-activating paid accounts)
// ============================================================
// npm install stripe
// Then uncomment and set STRIPE_WEBHOOK_SECRET below
//
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// app.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
//   const sig = req.headers['stripe-signature'];
//   let event;
//   try {
//     event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
//   } catch (err) {
//     return res.status(400).send(`Webhook Error: ${err.message}`);
//   }
//   if (event.type === 'checkout.session.completed') {
//     const session = event.data.object;
//     const email = session.customer_email;
//     const plan = session.metadata.plan;
//     console.log(`✓ Payment received: ${email} → ${plan}`);
//     // TODO: save to your database and grant access
//   }
//   res.json({ received: true });
// });

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  ✦ WriteFlow AI server running!
  → Open: http://localhost:${PORT}
  → API key: ${ANTHROPIC_API_KEY ? '✓ Set (from .env or env var)' : '✗ MISSING — create .env file!'}
  `);
});
