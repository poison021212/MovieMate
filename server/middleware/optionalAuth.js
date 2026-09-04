const jwt = require('jsonwebtoken')

/** 有 Bearer 则解析 req.user，无 token 或无效则 req.user = null，不阻断请求 */
module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    req.user = null
    return next()
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET)
    req.user = decoded
  } catch {
    req.user = null
  }
  next()
}
