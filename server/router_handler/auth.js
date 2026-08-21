const db = require('../db/index.js')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const {
  register_schema,
  login_schema,
  verify_email_schema,
  resend_verification_schema,
  forgot_password_schema,
  reset_password_schema,
  refresh_schema,
  logout_schema,
} = require('../schema/user.js')
const { generateToken, hashToken } = require('../utils/cryptoToken.js')
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService.js')
const { checkLoginAllowed, recordFailure, clearFailures } = require('../utils/loginRateLimit.js')
const { authLog } = require('../utils/authAuditLog.js')
const refreshStore = require('../utils/refreshTokenStore.js')

const ACCESS_EXPIRE = process.env.JWT_ACCESS_EXPIRE || process.env.JWT_EXPIRE || '30m'
const REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d'

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
}

function normalizeUsername(username) {
  return String(username || '').trim()
}

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown'
}

function signAccessToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_EXPIRE,
  })
}

function refreshExpiresAt() {
  const days = REFRESH_EXPIRE.endsWith('d') ? parseInt(REFRESH_EXPIRE, 10) : 7
  const ms = days * 24 * 60 * 60 * 1000
  return new Date(Date.now() + ms)
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    emailVerified: Boolean(row.email_verified),
    status: row.status || 'active',
  }
}

async function issueTokenPair(req, userRow) {
  const accessToken = signAccessToken(userRow)
  const refreshToken = generateToken(48)
  await refreshStore.createRefreshSession(
    userRow.id,
    refreshToken,
    req.headers['user-agent'],
    refreshExpiresAt()
  )
  return {
    jwt: accessToken,
    accessToken,
    refreshToken,
    expiresIn: ACCESS_EXPIRE,
    user: publicUser(userRow),
  }
}

async function createEmailVerificationToken(userId) {
  const raw = generateToken(32)
  const hours = Number(process.env.EMAIL_VERIFY_EXPIRE_HOURS || 24)
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000)
  await db.query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [userId, hashToken(raw), expiresAt]
  )
  return raw
}

async function createPasswordResetToken(userId) {
  const raw = generateToken(32)
  const hours = Number(process.env.PASSWORD_RESET_EXPIRE_HOURS || 1)
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000)
  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [userId, hashToken(raw), expiresAt]
  )
  return raw
}

function isMissingAuthTable(err) {
  return err?.code === 'ER_NO_SUCH_TABLE'
}

exports.register = async (req, res) => {
  const { error } = register_schema.validate(req.body)
  if (error) return res.cc(error.details[0].message, 400)

  const username = normalizeUsername(req.body.username)
  const email = normalizeEmail(req.body.email)
  const { password } = req.body

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE username=? OR email=?', [
      username,
      email,
    ])
    if (existing.length > 0) return res.cc('用户名或邮箱已被占用', 400)

    const hashedPassword = await bcrypt.hash(password, 10)
    const [result] = await db.query(
      `INSERT INTO users (username, email, password, email_verified, status, created_at)
       VALUES (?, ?, ?, 0, 'active', NOW())`,
      [username, email, hashedPassword]
    )

    const rawToken = await createEmailVerificationToken(result.insertId)
    await sendVerificationEmail(email, rawToken)

    authLog('register_success', { userId: result.insertId, username })
    res.success(
      {
        message: '注册成功，请查收验证邮件后登录',
        data: { userId: result.insertId, email },
      },
      201
    )
  } catch (err) {
    if (isMissingAuthTable(err)) {
      return res.cc('缺少认证相关表，请执行 server/sql/auth_upgrade.sql', 503)
    }
    authLog('register_failed', { username, reason: err.message })
    return res.cc('注册失败，请稍后重试', 500)
  }
}

exports.verifyEmail = async (req, res) => {
  const { error } = verify_email_schema.validate(req.body)
  if (error) return res.cc(error.details[0].message, 400)

  const { token } = req.body
  try {
    const [rows] = await db.query(
      `SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE token_hash = ? LIMIT 1`,
      [hashToken(token)]
    )
    const row = rows[0]
    if (!row || row.used_at) return res.cc('验证链接无效或已使用', 400)
    if (new Date(row.expires_at) < new Date()) return res.cc('验证链接已过期', 400)

    await db.query(`UPDATE users SET email_verified = 1 WHERE id = ?`, [row.user_id])
    await db.query(`UPDATE email_verification_tokens SET used_at = NOW() WHERE id = ?`, [row.id])

    authLog('email_verified', { userId: row.user_id })
    res.success({ message: '邮箱验证成功，现在可以登录' })
  } catch (err) {
    if (isMissingAuthTable(err)) {
      return res.cc('缺少认证相关表，请执行 server/sql/auth_upgrade.sql', 503)
    }
    return res.cc('验证失败', 500)
  }
}

exports.resendVerification = async (req, res) => {
  const { error } = resend_verification_schema.validate(req.body)
  if (error) return res.cc(error.details[0].message, 400)

  const email = normalizeEmail(req.body.email)
  try {
    const [users] = await db.query(
      `SELECT id, email, email_verified FROM users WHERE email = ? LIMIT 1`,
      [email]
    )
    if (!users.length) {
      return res.success({ message: '若邮箱已注册且未验证，将收到新的验证邮件' })
    }
    const user = users[0]
    if (user.email_verified) {
      return res.success({ message: '该邮箱已验证，可直接登录' })
    }
    const rawToken = await createEmailVerificationToken(user.id)
    await sendVerificationEmail(user.email, rawToken)
    res.success({ message: '验证邮件已发送' })
  } catch (err) {
    if (isMissingAuthTable(err)) {
      return res.cc('缺少认证相关表，请执行 server/sql/auth_upgrade.sql', 503)
    }
    return res.cc('发送失败', 500)
  }
}

exports.login = async (req, res) => {
  const { error } = login_schema.validate(req.body)
  if (error) return res.cc(error.details[0].message, 400)

  const identifier = String(req.body.identifier).trim()
  const { password } = req.body
  const ip = clientIp(req)

  const gate = checkLoginAllowed(ip, identifier)
  if (!gate.allowed) {
    authLog('login_rate_limited', { ip, identifier })
    return res.cc(gate.reason, 429)
  }

  try {
    const [result] = await db.query(
      `SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1`,
      [identifier, normalizeEmail(identifier)]
    )
    if (result.length !== 1) {
      recordFailure(ip, identifier)
      authLog('login_failed', { ip, identifier, reason: 'invalid_credentials' })
      return res.cc('用户名或密码错误', 401)
    }

    const user = result[0]
    if (user.status === 'banned') {
      return res.cc('账号已被禁用', 403)
    }
    if (user.status === 'locked') {
      return res.cc('账号已锁定，请稍后再试或联系管理员', 403)
    }
    if (!user.email_verified) {
      return res.cc('邮箱尚未验证，请先验证后再登录', 403)
    }

    const ok = bcrypt.compareSync(password, user.password)
    if (!ok) {
      recordFailure(ip, identifier)
      authLog('login_failed', { ip, identifier, reason: 'invalid_credentials' })
      return res.cc('用户名或密码错误', 401)
    }

    clearFailures(ip, identifier)
    const tokens = await issueTokenPair(req, user)
    authLog('login_success', { userId: user.id, username: user.username })
    res.json(tokens)
  } catch (err) {
    if (isMissingAuthTable(err)) {
      return res.cc('缺少认证相关表，请执行 server/sql/auth_upgrade.sql', 503)
    }
    authLog('login_error', { ip, identifier, reason: err.message })
    return res.cc('登录失败，请稍后重试', 500)
  }
}

exports.refresh = async (req, res) => {
  const { error } = refresh_schema.validate(req.body)
  if (error) return res.cc(error.details[0].message, 400)

  const { refreshToken } = req.body
  try {
    const session = await refreshStore.findValidRefreshSession(refreshToken)
    if (!session) return res.cc('刷新令牌无效或已过期', 401)

    const [users] = await db.query(`SELECT * FROM users WHERE id = ? LIMIT 1`, [session.user_id])
    const user = users[0]
    if (!user || user.status !== 'active' || !user.email_verified) {
      await refreshStore.revokeRefreshSession(refreshToken)
      return res.cc('账号状态异常', 403)
    }

    const newRefresh = generateToken(48)
    const rotated = await refreshStore.rotateRefreshSession(
      refreshToken,
      newRefresh,
      refreshExpiresAt()
    )
    if (!rotated) return res.cc('刷新令牌无效或已过期', 401)

    const accessToken = signAccessToken(user)
    res.json({
      jwt: accessToken,
      accessToken,
      refreshToken: newRefresh,
      expiresIn: ACCESS_EXPIRE,
      user: publicUser(user),
    })
  } catch (err) {
    if (isMissingAuthTable(err)) {
      return res.cc('缺少认证相关表，请执行 server/sql/auth_upgrade.sql', 503)
    }
    return res.cc('刷新失败', 500)
  }
}

exports.logout = async (req, res) => {
  const { error } = logout_schema.validate(req.body || {})
  if (error) return res.cc(error.details[0].message, 400)

  try {
    const { refreshToken, allDevices } = req.body || {}
    if (allDevices && req.user?.id) {
      await refreshStore.revokeAllUserSessions(req.user.id)
      authLog('logout_all', { userId: req.user.id })
    } else if (refreshToken) {
      await refreshStore.revokeRefreshSession(refreshToken)
      authLog('logout', { userId: req.user?.id || null })
    }
    res.status(204).send()
  } catch (err) {
    return res.cc('退出失败', 500)
  }
}

exports.forgotPassword = async (req, res) => {
  const { error } = forgot_password_schema.validate(req.body)
  if (error) return res.cc(error.details[0].message, 400)

  const email = normalizeEmail(req.body.email)
  try {
    const [users] = await db.query(`SELECT id, email FROM users WHERE email = ? LIMIT 1`, [email])
    if (users.length) {
      const raw = await createPasswordResetToken(users[0].id)
      await sendPasswordResetEmail(users[0].email, raw)
    }
    res.success({ message: '若邮箱已注册，将收到密码重置链接' })
  } catch (err) {
    if (isMissingAuthTable(err)) {
      return res.cc('缺少认证相关表，请执行 server/sql/auth_upgrade.sql', 503)
    }
    return res.cc('请求失败', 500)
  }
}

exports.resetPassword = async (req, res) => {
  const { error } = reset_password_schema.validate(req.body)
  if (error) return res.cc(error.details[0].message, 400)

  const { token, password } = req.body
  try {
    const [rows] = await db.query(
      `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ? LIMIT 1`,
      [hashToken(token)]
    )
    const row = rows[0]
    if (!row || row.used_at) return res.cc('重置链接无效或已使用', 400)
    if (new Date(row.expires_at) < new Date()) return res.cc('重置链接已过期', 400)

    const hashed = await bcrypt.hash(password, 10)
    await db.query(`UPDATE users SET password = ? WHERE id = ?`, [hashed, row.user_id])
    await db.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?`, [row.id])
    await refreshStore.revokeAllUserSessions(row.user_id)

    authLog('password_reset', { userId: row.user_id })
    res.success({ message: '密码已重置，请重新登录' })
  } catch (err) {
    if (isMissingAuthTable(err)) {
      return res.cc('缺少认证相关表，请执行 server/sql/auth_upgrade.sql', 503)
    }
    return res.cc('重置失败', 500)
  }
}
