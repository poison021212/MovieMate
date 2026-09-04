const { authLog } = require('./authAuditLog.js')

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || 'http://localhost:5173'

async function sendVerificationEmail(email, rawToken) {
  const link = `${APP_PUBLIC_URL}/auth/verify?token=${encodeURIComponent(rawToken)}`
  // Demo: log event only；绝不打印含 token 的链接，避免明文泄漏进日志
  authLog('verification_email_queued', { email })
  return link
}

async function sendPasswordResetEmail(email, rawToken) {
  const link = `${APP_PUBLIC_URL}/auth/reset-password?token=${encodeURIComponent(rawToken)}`
  authLog('password_reset_email_queued', { email })
  return link
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail }
