const REFRESH_COOKIE = 'refreshToken'
const REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d'

function refreshMaxAgeMs() {
  const days = REFRESH_EXPIRE.endsWith('d') ? parseInt(REFRESH_EXPIRE, 10) : 7
  return days * 24 * 60 * 60 * 1000
}

function refreshCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: refreshMaxAgeMs(),
  }
}

function setRefreshCookie(res, refreshToken) {
  if (!refreshToken) return
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions())
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
  })
}

function getRefreshTokenFromRequest(req) {
  // 只认 HttpOnly Cookie：明文 body 通道会削弱 HttpOnly 的防 XSS 意义
  return req.cookies?.[REFRESH_COOKIE] || null
}

function sendAuthJson(res, tokens) {
  setRefreshCookie(res, tokens.refreshToken)
  const { refreshToken, ...payload } = tokens
  res.json(payload)
}

module.exports = {
  REFRESH_COOKIE,
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshTokenFromRequest,
  sendAuthJson,
}
