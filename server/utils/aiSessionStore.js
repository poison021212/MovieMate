const db = require('../db/index.js')

async function listSessions(username) {
  const [rows] = await db.query(
    `SELECT id, title, summary, created_at, updated_at
     FROM ai_recommend_sessions
     WHERE username = ?
     ORDER BY updated_at DESC
     LIMIT 50`,
    [username]
  )
  return rows
}

async function createSession(username, title) {
  const safeTitle = (title || '新会话').slice(0, 255)
  const [result] = await db.query(
    `INSERT INTO ai_recommend_sessions (username, title) VALUES (?, ?)`,
    [username, safeTitle]
  )
  return result.insertId
}

async function deleteSession(username, sessionId) {
  const [result] = await db.query(
    `DELETE FROM ai_recommend_sessions WHERE id = ? AND username = ?`,
    [sessionId, username]
  )
  return result.affectedRows > 0
}

async function getSessionForUser(username, sessionId) {
  const [rows] = await db.query(
    `SELECT id, title, summary FROM ai_recommend_sessions WHERE id = ? AND username = ?`,
    [sessionId, username]
  )
  return rows[0] || null
}

async function touchSession(sessionId, titlePatch) {
  if (titlePatch) {
    await db.query(`UPDATE ai_recommend_sessions SET title = ? WHERE id = ?`, [
      titlePatch.slice(0, 255),
      sessionId,
    ])
  } else {
    await db.query(`UPDATE ai_recommend_sessions SET updated_at = NOW() WHERE id = ?`, [sessionId])
  }
}

async function updateSessionSummary(sessionId, summary) {
  if (!summary) return
  await db.query(`UPDATE ai_recommend_sessions SET summary = ? WHERE id = ?`, [
    summary.slice(0, 500),
    sessionId,
  ])
}

async function listMessages(sessionId, limit = 100) {
  const [rows] = await db.query(
    `SELECT id, role, content, movies_json, meta_json, created_at
     FROM ai_recommend_messages
     WHERE session_id = ?
     ORDER BY id ASC
     LIMIT ?`,
    [sessionId, limit]
  )
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    movies:
      row.movies_json == null
        ? null
        : typeof row.movies_json === 'string'
          ? JSON.parse(row.movies_json)
          : row.movies_json,
    meta:
      row.meta_json == null
        ? null
        : typeof row.meta_json === 'string'
          ? JSON.parse(row.meta_json)
          : row.meta_json,
    createdAt: row.created_at,
  }))
}

async function appendMessage(sessionId, role, content, movies, meta) {
  const [result] = await db.query(
    `INSERT INTO ai_recommend_messages (session_id, role, content, movies_json, meta_json)
     VALUES (?, ?, ?, ?, ?)`,
    [
      sessionId,
      role,
      content,
      movies ? JSON.stringify(movies) : null,
      meta ? JSON.stringify(meta) : null,
    ]
  )
  return result.insertId
}

module.exports = {
  listSessions,
  createSession,
  deleteSession,
  getSessionForUser,
  touchSession,
  updateSessionSummary,
  listMessages,
  appendMessage,
}
