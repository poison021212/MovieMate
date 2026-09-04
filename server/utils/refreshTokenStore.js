const db = require('../db/index.js')
const { hashToken } = require('./cryptoToken.js')

async function createRefreshSession(userId, rawToken, userAgent, expiresAt) {
  await db.query(
    `INSERT INTO refresh_sessions (user_id, token_hash, expires_at, user_agent) VALUES (?, ?, ?, ?)`,
    [userId, hashToken(rawToken), expiresAt, userAgent || null]
  )
}

async function findValidRefreshSession(rawToken) {
  const [rows] = await db.query(
    `SELECT id, user_id, expires_at, revoked_at FROM refresh_sessions WHERE token_hash = ? LIMIT 1`,
    [hashToken(rawToken)]
  )
  const row = rows[0]
  if (!row || row.revoked_at) return null
  if (new Date(row.expires_at) < new Date()) return null
  return row
}

async function revokeRefreshSession(rawToken) {
  await db.query(
    `UPDATE refresh_sessions SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL`,
    [hashToken(rawToken)]
  )
}

async function revokeAllUserSessions(userId) {
  await db.query(
    `UPDATE refresh_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  )
}

async function rotateRefreshSession(oldRawToken, newRawToken, expiresAt) {
  const session = await findValidRefreshSession(oldRawToken)
  if (!session) return null
  await revokeRefreshSession(oldRawToken)
  await db.query(
    `INSERT INTO refresh_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [session.user_id, hashToken(newRawToken), expiresAt]
  )
  return session.user_id
}

module.exports = {
  createRefreshSession,
  findValidRefreshSession,
  revokeRefreshSession,
  revokeAllUserSessions,
  rotateRefreshSession,
}
