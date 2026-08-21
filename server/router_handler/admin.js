const db = require('../db/index.js')

async function writeAudit(adminUsername, action, targetType, targetId, detail) {
  try {
    await db.query(
      `INSERT INTO admin_audit_log (admin_username, action, target_type, target_id, detail)
       VALUES (?, ?, ?, ?, ?)`,
      [
        adminUsername,
        action,
        targetType || null,
        targetId != null ? String(targetId) : null,
        detail ? JSON.stringify(detail) : null,
      ]
    )
  } catch (err) {
    console.error('writeAudit', err)
  }
}

exports.getAdminMe = async (req, res) => {
  res.json({ success: true, admin: req.adminUser })
}

exports.listUsers = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, username, email, status, role, email_verified, created_at
       FROM users ORDER BY id DESC LIMIT 200`
    )
    res.json({ success: true, users: rows })
  } catch (err) {
    res.status(500).json({ error: { message: '获取用户列表失败' } })
  }
}

exports.updateUserStatus = async (req, res) => {
  const userId = Number(req.params.id)
  const status = req.body?.status
  if (!userId || !['active', 'locked', 'banned'].includes(status)) {
    return res.cc('参数无效', 400)
  }
  try {
    const [rows] = await db.query('SELECT username, role FROM users WHERE id = ?', [userId])
    const target = rows[0]
    if (!target) return res.cc('用户不存在', 404)
    if (target.role === 'admin' && status === 'banned') {
      return res.cc('不能封禁管理员', 400)
    }
    await db.query('UPDATE users SET status = ? WHERE id = ?', [status, userId])
    await writeAudit(req.adminUser.username, 'user.status', 'user', userId, {
      status,
      targetUsername: target.username,
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: { message: '更新用户状态失败' } })
  }
}

exports.listReviews = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT r.id, r.movieId, r.username, r.rating, r.content, r.date, m.title AS movieTitle
       FROM reviews r
       LEFT JOIN movies m ON m.id = r.movieId
       ORDER BY r.date DESC
       LIMIT 100`
    )
    res.json({ success: true, reviews: rows })
  } catch (err) {
    res.status(500).json({ error: { message: '获取评论列表失败' } })
  }
}

exports.deleteReview = async (req, res) => {
  const reviewId = Number(req.params.id)
  if (!reviewId) return res.cc('评论 id 无效', 400)
  try {
    const [rows] = await db.query('SELECT username, movieId FROM reviews WHERE id = ?', [reviewId])
    const review = rows[0]
    if (!review) return res.cc('评论不存在', 404)
    await db.query('DELETE FROM reviews WHERE id = ?', [reviewId])
    await writeAudit(req.adminUser.username, 'review.delete', 'review', reviewId, review)
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: { message: '删除评论失败' } })
  }
}

exports.listAuditLog = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, admin_username, action, target_type, target_id, detail, created_at
       FROM admin_audit_log ORDER BY id DESC LIMIT 100`
    )
    res.json({ success: true, logs: rows })
  } catch (err) {
    res.status(500).json({ error: { message: '获取审计日志失败' } })
  }
}
