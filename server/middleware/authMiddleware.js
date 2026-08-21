const jwt = require('jsonwebtoken')
const { authLog } = require('../utils/authAuditLog.js')

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    authLog('auth_missing', { path: req.path, method: req.method })
    return res.cc('身份验证失败', 401)
  }
  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    authLog('auth_invalid', { path: req.path, method: req.method, reason: err.name })
    return res.cc('无效或过期的token', 401)
  }
}
