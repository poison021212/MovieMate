import { describe, it, expect, beforeEach } from 'vitest'
import { request, app, db, createUser, login, truncateAll } from './helpers.js'

describe('认证与会话', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('注册成功,未验证不能登录,验证后可登录并下发双 token', async () => {
    const { username, password, registerRes } = await createUser({ verified: false })
    expect([200, 201]).toContain(registerRes.status)

    const notVerified = await request(app).post('/api/auth/local').send({ identifier: username, password })
    expect(notVerified.status).toBe(403)

    await db.query('UPDATE users SET email_verified = 1 WHERE username = ?', [username])

    const { res } = await login(username, password)
    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeTruthy()
    const setCookie = res.headers['set-cookie'] || []
    expect(setCookie.some((c) => c.startsWith('refreshToken='))).toBe(true)
  })

  it('用户名/邮箱重复注册返回 400', async () => {
    await createUser({ username: 'dup_user', email: 'dup@example.com' })
    const res = await request(app)
      .post('/api/auth/local/register')
      .send({ username: 'dup_user', email: 'another@example.com', password: 'StrongPass1!' })
    expect(res.status).toBe(400)
    expect(res.body.error?.message).toContain('占用')
  })

  it('弱密码被拒绝', async () => {
    const res = await request(app)
      .post('/api/auth/local/register')
      .send({ username: 'weak_user', email: 'weak@example.com', password: '123456' })
    expect(res.status).toBe(400)
  })

  it('密码错误返回 401', async () => {
    const { username } = await createUser()
    const res = await request(app).post('/api/auth/local').send({ identifier: username, password: 'WrongPass9!' })
    expect(res.status).toBe(401)
  })

  it('带 token 可访问 /auth/me,无 token 返回 401', async () => {
    const { username } = await createUser()
    const { res } = await login(username)

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`)
    expect(me.status).toBe(200)
    expect(me.body.user.username).toBe(username)

    const noToken = await request(app).get('/api/auth/me')
    expect(noToken.status).toBe(401)
  })

  it('伪造/过期 token 返回 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt')
    expect(res.status).toBe(401)
  })

  it('refresh 仅依赖 HttpOnly Cookie,无 cookie 时 401', async () => {
    const { username, password } = await createUser()
    const { agent, res } = await login(username, password)

    const refreshed = await agent.post('/api/auth/refresh')
    expect(refreshed.status).toBe(200)
    expect(refreshed.body.accessToken).toBeTruthy()

    const noCookie = await request(app).post('/api/auth/refresh')
    expect(noCookie.status).toBe(401)
  })

  it('被封禁用户已签发的 access 立即失效(回查 DB)', async () => {
    const { username, password } = await createUser()
    const { res } = await login(username, password)
    const access = res.body.accessToken

    await db.query('UPDATE users SET status = ? WHERE username = ?', ['banned', username])

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${access}`)
    expect(me.status).toBe(403)
    expect(me.body.error?.message).toContain('账号不可用')
  })

  it('logout 正常返回', async () => {
    const { username, password } = await createUser()
    const { agent, res } = await login(username, password)
    // logout 需要 Bearer（authMiddleware）+ cookie（撤销 refresh session）
    const out = await agent.post('/api/auth/logout').set('Authorization', `Bearer ${res.body.accessToken}`)
    expect([200, 204]).toContain(out.status)
  })
})