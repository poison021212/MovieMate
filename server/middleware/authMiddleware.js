const jwt = require('jsonwebtoken')

module.exports = (req, res, next) => {
  console.log('=== 认证中间件 ===');
  console.log('请求路径:', req.method, req.url);
  console.log('Authorization 头:', req.headers.authorization);

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ 缺少或格式错误的 Authorization 头');
    return res.cc('身份验证失败', 401)
  }
  const token = authHeader.split(' ')[1]
  try {
    // 验证并解码 JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded// 挂载用户信息{id,username,avatar}
    next()
  } catch (err) {
    return res.cc('无效或过期的token', 401)
  }
}