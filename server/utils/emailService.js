const { authLog } = require('./authAuditLog.js')

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || 'http://localhost:5173'

async function sendVerificationEmail(email, rawToken) {
  const link = `${APP_PUBLIC_URL}/auth/verify?token=${encodeURIComponent(rawToken)}`
  // Demo: log link; production can plug SMTP / SendGrid via env
  authLog('verification_email_queued', { email, linkPreview: link.slice(0, 48) + '…' })
  console.log(`[auth] 邮箱验证链接 (${email}): ${link}`)
  return link
}

async function sendPasswordResetEmail(email, rawToken) {
  const link = `${APP_PUBLIC_URL}/auth/reset-password?token=${encodeURIComponent(rawToken)}`
  authLog('password_reset_email_queued', { email, linkPreview: link.slice(0, 48) + '…' })
  console.log(`[auth] 密码重置链接 (${email}): ${link}`)
  return link
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail }
