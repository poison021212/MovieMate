const db = require('../db/index.js')

let feedbackTableReady = false

async function ensureFeedbackTable() {
  if (feedbackTableReady) return true
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ai_recommend_feedback (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(15) NOT NULL,
        session_id INT UNSIGNED NULL,
        movie_title VARCHAR(255) NOT NULL,
        local_movie_id INT UNSIGNED NULL,
        tmdb_id INT UNSIGNED NULL,
        action ENUM('like', 'dislike', 'refresh_batch') NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_feedback_user_time (username, created_at),
        KEY idx_feedback_session (session_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    feedbackTableReady = true
    return true
  } catch (err) {
    console.error('ensureFeedbackTable failed:', err.message)
    return false
  }
}

async function recordFeedback({ username, sessionId, movieTitle, localMovieId, tmdbId, action }) {
  const ready = await ensureFeedbackTable()
  if (!ready) {
    throw new Error('反馈表不可用')
  }
  await db.query(
    `INSERT INTO ai_recommend_feedback
      (username, session_id, movie_title, local_movie_id, tmdb_id, action)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      username,
      sessionId || null,
      movieTitle,
      localMovieId || null,
      tmdbId || null,
      action,
    ]
  )
}

async function getRecentFeedback(username, limit = 12) {
  const ready = await ensureFeedbackTable()
  if (!ready) {
    return { likes: [], dislikes: [], refreshCount: 0 }
  }
  const [rows] = await db.query(
    `SELECT movie_title, local_movie_id, tmdb_id, action, created_at
     FROM ai_recommend_feedback
     WHERE username = ?
     ORDER BY id DESC
     LIMIT ?`,
    [username, limit]
  )
  const likes = []
  const dislikes = []
  let refreshCount = 0
  rows.forEach((row) => {
    if (row.action === 'like') likes.push(row.movie_title)
    if (row.action === 'dislike') dislikes.push(row.movie_title)
    if (row.action === 'refresh_batch') refreshCount += 1
  })
  return { likes, dislikes, refreshCount }
}

function buildFeedbackHint(feedback) {
  if (!feedback) return ''
  const parts = []
  if (feedback.dislikes?.length) {
    parts.push(`用户最近点踩的影片（下轮推荐请避开）：${[...new Set(feedback.dislikes)].slice(0, 8).join('、')}`)
  }
  if (feedback.likes?.length) {
    parts.push(`用户最近点赞的影片（可优先考虑同类型）：${[...new Set(feedback.likes)].slice(0, 5).join('、')}`)
  }
  if (feedback.refreshCount > 0) {
    parts.push('用户近期多次点击「换一批」，请提供与上一轮不同的候选。')
  }
  return parts.length ? parts.join('\n') : ''
}

module.exports = {
  ensureFeedbackTable,
  recordFeedback,
  getRecentFeedback,
  buildFeedbackHint,
}
