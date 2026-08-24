const request = require('supertest')
const db = require('../db/index.js')
const app = require('../app.js')

const PASSWORD = 'StrongPass1!'

async function truncateAll() {
  const childFirst = [
    'review_replies',
    'reviews',
    'favorites',
    'ai_recommend_messages',
    'ai_recommend_sessions',
    'email_verification_tokens',
    'password_reset_tokens',
    'refresh_sessions',
    'users',
  ]
  await db.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const table of childFirst) {
    await db.query(`TRUNCATE TABLE \`${table}\``)
  }
  await db.query('SET FOREIGN_KEY_CHECKS = 1')
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8)
}

async function createUser({ username, email, password = PASSWORD, verified = true, status = 'active' } = {}) {
  const name = username || `user_${randomSuffix()}`
  const mail = email || `${name}@example.com` // Joi 邮箱校验要求合法 TLD，避免 .local
  const registerRes = await request(app)
    .post('/api/auth/local/register')
    .send({ username: name, email: mail, password })
  if (verified) {
    await db.query('UPDATE users SET email_verified = 1 WHERE username = ?', [name])
  }
  if (status !== 'active') {
    await db.query('UPDATE users SET status = ? WHERE username = ?', [status, name])
  }
  return { username: name, email: mail, password, registerRes }
}

async function login(identifier, password = PASSWORD) {
  const agent = request.agent(app)
  const res = await agent.post('/api/auth/local').send({ identifier, password })
  return { agent, res }
}

// 带 Bearer 的请求辅助（agent 只自动带 cookie，收藏/评论/登出等接口需要显式 token）
function getApi(accessToken) {
  const base = request(app)
  return {
    get: (url) => base.get(url).set('Authorization', `Bearer ${accessToken}`),
    post: (url) => base.post(url).set('Authorization', `Bearer ${accessToken}`),
    put: (url) => base.put(url).set('Authorization', `Bearer ${accessToken}`),
    delete: (url) => base.delete(url).set('Authorization', `Bearer ${accessToken}`),
  }
}

module.exports = { request, db, app, PASSWORD, truncateAll, createUser, login, getApi }