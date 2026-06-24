const express = require('express');
const { requireAuth } = require('../lib/auth');
const { getEffectivePlan } = require('../lib/entitlements');
const { getPlanFeatures } = require('../lib/planFeatures');
const {
  ensureBusinessTeam,
  getTeamForUser,
  getTeamMembers,
  getMemberCount,
  inviteByEmail,
  removeMember,
  MAX_SEATS,
} = require('../lib/teams');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const plan = getEffectivePlan(req.user);
  const features = getPlanFeatures(plan);
  if (!features.teamSeats) {
    return res.status(403).json({ error: 'Business plan required for team management' });
  }

  const owned = req.user.plan === 'business';
  if (!owned) {
    const membership = getTeamForUser(req.user.id);
    return res.json({
      role: membership?.role || 'member',
      team: membership?.team || null,
      members: membership ? getTeamMembers(membership.team.id) : [],
      seats: { used: membership ? getMemberCount(membership.team.id) : 0, max: MAX_SEATS },
    });
  }

  const team = ensureBusinessTeam(req.user.id);
  res.json({
    role: 'owner',
    team,
    members: getTeamMembers(team.id),
    seats: { used: getMemberCount(team.id), max: team.max_seats || MAX_SEATS },
  });
});

router.post('/invite', requireAuth, (req, res) => {
  if (req.user.plan !== 'business') {
    return res.status(403).json({ error: 'Only the Business plan owner can invite teammates' });
  }
  const { email } = req.body;
  if (!email?.trim()) return res.status(400).json({ error: 'Email required' });

  const team = ensureBusinessTeam(req.user.id);
  try {
    const result = inviteByEmail(team.id, email);
    res.json({ ok: true, ...result, message: result.status === 'added' ? 'Teammate added' : 'Invite saved — they get access when they sign up' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/members/:userId', requireAuth, (req, res) => {
  if (req.user.plan !== 'business') {
    return res.status(403).json({ error: 'Only the Business plan owner can remove members' });
  }
  const team = ensureBusinessTeam(req.user.id);
  try {
    removeMember(team.id, req.user.id, req.params.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;