# Sparknous

Production-ready AI writing SaaS — 43 professional templates powered by Claude.

## Features

- 43 writing templates across 8 categories
- Server-enforced freemium limits (3 free/day)
- User accounts with JWT session cookies
- Stripe payments (subscriptions + credit packs)
- Pro features: output history, tone presets, Word export
- Security: helmet, rate limiting, no client-side entitlement bypass

## Quick start

```bash
cp .env.example .env
# Add ANTHROPIC_API_KEY and JWT_SECRET

npm install
npm start
```

Open http://localhost:3000

### Local dev without Stripe

In `.env`:
```
ALLOW_DEMO_CHECKOUT=true
NODE_ENV=development
```

Create an account and use checkout buttons — plans activate via `/api/dev/checkout`.

## Environment variables

See `.env.example` for the full list. Required for production:

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API |
| `JWT_SECRET` | Session signing (use a long random string) |
| `STRIPE_SECRET_KEY` | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | Webhook verification |
| `STRIPE_LINK_*` | Payment link URLs for each plan/pack |

## Stripe setup

1. Create products in [Stripe Dashboard](https://dashboard.stripe.com/products)
2. Create Payment Links for each plan
3. Add `metadata.plan` to each link: `pro`, `business`, `pack-50`, `pack-200`, `pack-500`, or `pack-1000`
4. Set webhook endpoint: `https://yourdomain.com/api/webhooks/stripe`
5. Listen for `checkout.session.completed`

Users who pay before signing up get entitlements applied when they register with the same email.

## Deploy on Render

This project includes a `render.yaml` Blueprint for one-click setup.

1. Push to GitHub
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → select repo
3. Add secret env vars (`ANTHROPIC_API_KEY`, Stripe keys/links)
4. Deploy

Render automatically mounts a persistent disk at `data/` for SQLite. Health check: `GET /health`

**Stripe webhook URL:** `https://your-service.onrender.com/api/webhooks/stripe`

See `LAUNCH-GUIDE.md` for the full Render walkthrough (Blueprint + manual setup).

## Project structure

```
sparknous/
├── index.html          # Frontend app
├── server.js           # Entry point
├── lib/                # DB, auth, entitlements
├── routes/             # API routes
├── privacy.html
├── terms.html
└── data/               # SQLite (gitignored)
```

## API

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/register` | Create account |
| `POST /api/auth/login` | Log in |
| `POST /api/auth/logout` | Log out |
| `GET /api/auth/me` | Current user + usage |
| `POST /api/generate` | Stream AI generation |
| `GET /api/history` | Pro generation history |
| `GET /api/presets` | Pro tone presets |
| `GET /api/config` | Public config + usage |
| `POST /api/v1/generate` | Business API (Bearer `sn_...`) |
| `GET /health` | Health check |

**API documentation:** [http://localhost:3000/api-docs](http://localhost:3000/api-docs) (or `/api-docs` on your deployed domain)

## License

Proprietary — Sparknous