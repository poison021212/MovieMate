const db = require('../db/index.js')

module.exports = async function adminMiddleware(req, res, next) {
  const username = req.user?.username
  if (!username) return res.cc('身份验证失败', 401)
  try {
    const [rows] = await db.query('SELECT role, status FROM users WHERE username = ? LIMIT 1', [
      username,
    ])
    const user = rows[0]
    if (!user || user.status !== 'active') return res.cc('账号不可用', 403)
    if (user.role !== 'admin') return res.cc('需要管理员权限', 403)
    req.adminUser = { username, role: user.role }
    next()
  } catch (err) {
    console.error('adminMiddleware', err)
    return res.cc('权限校验失败', 500)
  }
}
