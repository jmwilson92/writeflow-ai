const express = require('express');
const {
  registerUser,
  loginUser,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  publicUser,
  requireAuth,
} = require('../lib/auth');
const { getUsageSnapshot } = require('../lib/entitlements');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const user = await registerUser(req.body);
    const token = signToken(user);
    setAuthCookie(res, token);
    const usage = getUsageSnapshot({ user, ip: req.ip });
    res.json({ user: publicUser(user), usage });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const user = await loginUser(req.body);
    const token = signToken(user);
    setAuthCookie(res, token);
    const usage = getUsageSnapshot({ user, ip: req.ip });
    res.json({ user: publicUser(user), usage });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const usage = getUsageSnapshot({ user: req.user, ip: req.ip });
  res.json({ user: publicUser(req.user), usage });
});

module.exports = router;