# WriteFlow AI — Complete Launch Guide
## From zero to making money in 7 days

---

## What you have

- `index.html` — Your complete AI SaaS app (6 tools, freemium, pricing page, credit packs)
- `server.js` — Backend server (keeps your API key secret, handles rate limiting)
- `package.json` — Node.js dependencies
- This guide

---

## STEP 1: Get your Claude API key (5 min)

1. Go to https://console.anthropic.com
2. Sign up or log in
3. Click "API Keys" → "Create Key"
4. Copy your key (starts with `sk-ant-...`)
5. Open `server.js` and replace `sk-ant-YOUR_KEY_HERE` with your real key

**Cost check:** claude-sonnet-4-6 costs ~$0.003 per generation.
At $12/mo Pro, a user needs 4,000 generations to cost you more than their subscription. You're safe.

---

## STEP 2: Test it locally (10 min)

You need Node.js installed. Download it free at https://nodejs.org (get the LTS version).

Then open a terminal/command prompt in your project folder and run:

```bash
npm install
node server.js
```

Open your browser at http://localhost:3000 — your app is running!

---

## STEP 3: Deploy to the internet (20 min — FREE)

### Option A: Railway (easiest, recommended)
1. Go to https://railway.app and sign up (free)
2. Click "New Project" → "Deploy from GitHub"
3. Upload your 3 files to a new GitHub repo first (github.com → New Repository)
4. Connect Railway to that repo
5. Add environment variable: `ANTHROPIC_API_KEY` = your key
6. Click Deploy — Railway gives you a live URL like `yourapp.railway.app`

### Option B: Render (also free)
1. Go to https://render.com
2. New → Web Service → Connect GitHub repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add env var: `ANTHROPIC_API_KEY`

### Option C: Just the HTML file (simplest but API key exposed)
Open `index.html` in a browser. Works immediately for testing.
⚠️ Don't put your real API key in index.html for production — use the server.

---

## STEP 4: Set up payments (30 min)

### Stripe (most popular)
1. Sign up at https://stripe.com
2. Go to Products → Create product for each plan:
   - "Pro Monthly" → $12/month (recurring)
   - "Business Monthly" → $39/month (recurring)
   - "50 Credits" → $5 (one-time)
   - "200 Credits" → $15 (one-time)
   - "500 Credits" → $30 (one-time)
   - "1000 Credits" → $49 (one-time)
3. Get each product's "Payment link"
4. Open `index.html`, find the `handleCheckout` function, replace the placeholder URLs

### LemonSqueezy (easier, handles VAT globally)
1. Sign up at https://lemonsqueezy.com
2. Create your products the same way
3. Get your checkout URLs and paste them in `index.html`

---

## STEP 5: Get a custom domain (optional, $10-15/yr)

1. Buy a domain at Namecheap or Cloudflare (e.g. `writeflowai.com`)
2. Point it to your Railway/Render deployment
3. Both services have instructions for custom domains

---

## STEP 6: Launch and get your first customers

### Day 1: Product Hunt
- Go to https://producthunt.com → Submit your product
- Best to launch on Tuesday–Thursday
- Write a compelling tagline: "AI writing tools that get you hired and close deals"

### Week 1: Reddit
Post in these subreddits (share value, don't just spam):
- r/jobsearch (cover letter tool)
- r/entrepreneur (cold email tool)
- r/ecommerce (product description tool)
- r/forhire (LinkedIn bio tool)
- r/SideProject

### SEO pages to build (copy from index.html, change the content):
- `/cover-letter-generator` — target "AI cover letter generator"
- `/cold-email-generator` — target "cold email writer AI"
- `/product-description-generator` — target "AI product description generator"

### Twitter/X: Build in public
Post daily: your revenue, user count, what you're building. People love this.

---

## Revenue projections

| Monthly visitors | Free→Paid rate | Price | MRR |
|-----------------|----------------|-------|-----|
| 1,000 | 3% | $12 | $360 |
| 5,000 | 3% | $12 | $1,800 |
| 10,000 | 3% | $12 | $3,600 |
| 20,000 | 5% | $12 | $12,000 |

Your API cost is ~$0.003/generation. Even at 100 uses/user/month that's $0.30 per user.
Margin on a $12 Pro plan: **97.5%**

---

## Files overview

```
writeflow-ai/
├── index.html    ← Your complete app (6 tools + pricing + freemium)
├── server.js     ← Backend (API key protection + rate limiting)
├── package.json  ← Node dependencies
└── GUIDE.md      ← This file
```

---

## Need more tools? Add one in 3 steps:

1. Add a `.tool-card` div in `index.html` (copy an existing one)
2. Add a `fields-TOOLNAME` div with your input fields
3. Add a prompt function in `buildPrompt()` for your tool

---

## Questions?

Ask Claude: "How do I [specific thing] in WriteFlow AI?"

Good luck. Your first paying customer is closer than you think. 🚀
