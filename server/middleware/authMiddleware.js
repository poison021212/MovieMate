const db = require('../db/index.js')
const jwt = require('jsonwebtoken')
const { authLog } = require('../utils/authAuditLog.js')

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    authLog('auth_missing', { path: req.path, method: req.method })
    return res.cc('身份验证失败', 401)
  }
  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    // 回查 DB 状态：banned 用户即使 token 未过期也不能继续使用普通接口
    const [rows] = await db.query('SELECT status FROM users WHERE username = ? LIMIT 1', [
      decoded.username,
    ])
    const user = rows[0]
    if (!user || user.status !== 'active') {
      authLog('auth_banned', { path: req.path, username: decoded.username })
      return res.cc('账号不可用', 403)
    }
    req.user = decoded
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      authLog('auth_invalid', { path: req.path, method: req.method, reason: err.name })
      return res.cc('无效或过期的token', 401)
    }
    console.error('authMiddleware', err)
    return res.cc('身份校验失败', 500)
  }
}