# WriteFlow AI — Production Launch Guide

## What you have (v2.0)

- **43 AI writing templates** across 8 categories
- **Production backend** — auth, SQLite DB, server-side limits, Stripe webhooks
- **Pro features** — output history, tone presets, Word export
- **Legal pages** — `/privacy`, `/terms`
- **SEO** — meta tags, sitemap, robots.txt

---

## Step 1: Configure environment (10 min)

```bash
cp .env.example .env
```

**Required:**
- `ANTHROPIC_API_KEY` — from https://console.anthropic.com
- `JWT_SECRET` — run `openssl rand -hex 32` or use a long random string

**For payments:**
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`
- `STRIPE_LINK_*` — Payment Link URLs for each plan/pack

**For production:**
- `NODE_ENV=production`
- `ALLOWED_ORIGINS=https://yourdomain.com`
- `ALLOW_DEMO_CHECKOUT=false` (never true in prod)

---

## Step 2: Test locally

```bash
npm install
npm start
```

1. Open http://localhost:3000
2. Try a free generation (3/day without account)
3. Create an account (Sign up)
4. With `ALLOW_DEMO_CHECKOUT=true`, test Upgrade flow in dev

---

## Step 3: Stripe setup (30 min)

1. Create products at https://dashboard.stripe.com/products:
   - Pro Monthly ($12), Pro Annual ($84)
   - Business Monthly ($39), Business Annual ($276)
   - Credit packs: 50/$5, 200/$15, 500/$30, 1000/$49

2. Create **Payment Links** for each product

3. Add metadata to each link: `plan` = `pro`, `business`, `pack-50`, etc.

4. Copy Payment Link URLs into `.env` as `STRIPE_LINK_*`

5. Webhook endpoint: `https://yourdomain.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.deleted`

6. Users who pay **before** signing up get access when they register with the same email.

---

## Step 4: Deploy on Render (recommended)

### Option A — Blueprint (fastest)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New** → **Blueprint**
3. Connect your GitHub repo — Render reads `render.yaml` automatically
4. Fill in secret env vars when prompted:
   - `ANTHROPIC_API_KEY`
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
   - All `STRIPE_LINK_*` URLs
   - `ALLOWED_ORIGINS` → `https://your-app.onrender.com` (update after custom domain)
5. Deploy — Render provisions a **persistent disk** for SQLite at `data/`

### Option B — Manual Web Service

1. **New** → **Web Service** → connect GitHub repo
2. Settings:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Health check path:** `/health`
3. **Disks** → Add disk:
   - Mount path: `/opt/render/project/src/data`
   - Size: 1 GB
4. **Environment** → add all vars from `.env.example`
   - Set `DATABASE_PATH=/opt/render/project/src/data/writeflow.db`
   - Set `NODE_ENV=production`
   - Set `ALLOW_DEMO_CHECKOUT=false`
5. Deploy

### After deploy

- Your URL: `https://writeflow.onrender.com` (or your service name)
- Stripe webhook: `https://YOUR-URL.onrender.com/api/webhooks/stripe`
- Update `ALLOWED_ORIGINS` to your Render URL (and custom domain when added)

---

## Step 5: Custom domain

1. Buy domain (Namecheap, Cloudflare)
2. Point DNS to your host
3. Update `ALLOWED_ORIGINS` in env
4. Update `sitemap.xml` and canonical URLs in `index.html`

---

## Step 6: Launch marketing

- **Product Hunt** — Tuesday–Thursday launch
- **Reddit** — r/SideProject, r/entrepreneur, niche subs per template
- **SEO** — Add landing pages for top templates (cover letter, cold email)
- **Build in public** — Share MRR and user growth on X

---

## Revenue math

| Visitors/mo | Conversion | Price | MRR |
|-------------|------------|-------|-----|
| 1,000 | 3% | $12 | $360 |
| 5,000 | 3% | $12 | $1,800 |
| 10,000 | 5% | $12 | $6,000 |

API cost ~$0.003/generation. Margin on $12 Pro: **~97%**.

---

## Checklist before going live

- [ ] `ANTHROPIC_API_KEY` set
- [ ] `JWT_SECRET` is strong and unique
- [ ] `ALLOW_DEMO_CHECKOUT=false`
- [ ] All `STRIPE_LINK_*` configured
- [ ] Stripe webhook tested
- [ ] `NODE_ENV=production`
- [ ] Persistent storage for `data/`
- [ ] Custom domain + HTTPS
- [ ] Privacy & Terms reviewed

Good luck — your first paying customer is closer than you think.