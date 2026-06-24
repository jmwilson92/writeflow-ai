const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const MAX_SEATS = 5;

function getTeamByOwner(ownerId) {
  return db.prepare('SELECT * FROM teams WHERE owner_id = ?').get(ownerId);
}

function getTeamForUser(userId) {
  const owned = getTeamByOwner(userId);
  if (owned) return { team: owned, role: 'owner' };

  const member = db.prepare(`
    SELECT t.*, m.role FROM team_members m
    JOIN teams t ON m.team_id = t.id
    WHERE m.user_id = ?
  `).get(userId);

  if (member) {
    const { role, ...team } = member;
    return { team, role };
  }
  return null;
}

function ensureBusinessTeam(ownerId) {
  let team = getTeamByOwner(ownerId);
  if (!team) {
    const id = uuidv4();
    const now = Date.now();
    db.prepare('INSERT INTO teams (id, owner_id, name, max_seats, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, ownerId, 'My Team', MAX_SEATS, now);
    db.prepare('INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .run(id, ownerId, 'owner', now);
    team = getTeamByOwner(ownerId);
  }
  return team;
}

function getTeamMembers(teamId) {
  return db.prepare(`
    SELECT u.id, u.email, u.name, m.role, m.joined_at
    FROM team_members m
    JOIN users u ON m.user_id = u.id
    WHERE m.team_id = ?
    ORDER BY m.joined_at ASC
  `).all(teamId);
}

function getMemberCount(teamId) {
  return db.prepare('SELECT COUNT(*) as c FROM team_members WHERE team_id = ?').get(teamId).c;
}

function addMemberToTeam(teamId, userId, role = 'member') {
  const count = getMemberCount(teamId);
  const team = db.prepare('SELECT max_seats FROM teams WHERE id = ?').get(teamId);
  if (count >= (team?.max_seats || MAX_SEATS)) {
    throw Object.assign(new Error('Team seat limit reached (5 members)'), { status: 400 });
  }
  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(team_id, user_id) DO NOTHING
  `).run(teamId, userId, role, Date.now());
}

function inviteByEmail(teamId, email) {
  const normalized = email.trim().toLowerCase();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(normalized);
  if (user) {
    addMemberToTeam(teamId, user.id);
    return { status: 'added', email: normalized };
  }
  db.prepare(`
    INSERT INTO pending_team_invites (email, team_id, invited_at) VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET team_id = excluded.team_id, invited_at = excluded.invited_at
  `).run(normalized, teamId, Date.now());
  return { status: 'pending', email: normalized };
}

function applyPendingTeamInvite(email) {
  const normalized = email.trim().toLowerCase();
  const pending = db.prepare('SELECT * FROM pending_team_invites WHERE email = ?').get(normalized);
  if (!pending) return;

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(normalized);
  if (!user) return;

  try {
    addMemberToTeam(pending.team_id, user.id);
    db.prepare('DELETE FROM pending_team_invites WHERE email = ?').run(normalized);
  } catch {
    db.prepare('DELETE FROM pending_team_invites WHERE email = ?').run(normalized);
  }
}

function removeMember(teamId, ownerId, memberUserId) {
  const team = db.prepare('SELECT * FROM teams WHERE id = ? AND owner_id = ?').get(teamId, ownerId);
  if (!team) throw Object.assign(new Error('Not authorized'), { status: 403 });
  if (memberUserId === ownerId) throw Object.assign(new Error('Cannot remove team owner'), { status: 400 });
  db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, memberUserId);
}

function getBusinessPlanViaTeam(userId) {
  const row = db.prepare(`
    SELECT u.plan FROM team_members m
    JOIN teams t ON m.team_id = t.id
    JOIN users u ON t.owner_id = u.id
    WHERE m.user_id = ? AND u.plan = 'business'
  `).get(userId);
  return row?.plan === 'business';
}

module.exports = {
  MAX_SEATS,
  getTeamByOwner,
  getTeamForUser,
  ensureBusinessTeam,
  getTeamMembers,
  getMemberCount,
  inviteByEmail,
  applyPendingTeamInvite,
  removeMember,
  getBusinessPlanViaTeam,
};