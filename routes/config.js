const express = require('express');
const { getUsageSnapshot } = require('../lib/entitlements');
const { CREDIT_COSTS } = require('../lib/creditCosts');

const router = express.Router();

router.get('/', (req, res) => {
  const allowDemo = process.env.ALLOW_DEMO_CHECKOUT === 'true' && process.env.NODE_ENV !== 'production';

  res.json({
    appName: 'WriteFlow AI',
    stripeLinks: {
      pro: process.env.STRIPE_LINK_PRO || '',
      'pro-annual': process.env.STRIPE_LINK_PRO_ANNUAL || '',
      business: process.env.STRIPE_LINK_BUSINESS || '',
      'business-annual': process.env.STRIPE_LINK_BUSINESS_ANNUAL || '',
      'pack-50': process.env.STRIPE_LINK_PACK_50 || '',
      'pack-200': process.env.STRIPE_LINK_PACK_200 || '',
      'pack-500': process.env.STRIPE_LINK_PACK_500 || '',
      'pack-1000': process.env.STRIPE_LINK_PACK_1000 || '',
    },
    allowDemoCheckout: allowDemo,
    contactEmail: process.env.CONTACT_EMAIL || 'hello@writeflow.ai',
    creditCosts: CREDIT_COSTS,
    usage: getUsageSnapshot({ user: req.user, ip: req.ip }),
  });
});

module.exports = router;