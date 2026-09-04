import { describe, it, expect, beforeEach } from 'vitest'
import { request, app, createUser, login, getApi, truncateAll } from './helpers.js'

describe('收藏', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('未登录收藏返回 401', async () => {
    const res = await request(app).post('/api/favorites').send({ movieId: 1 })
    expect(res.status).toBe(401)
  })

  it('登录后添加/去重/列表(含电影信息)/删除 全链路', async () => {
    const { username, password } = await createUser()
    const { res } = await login(username, password)
    const api = getApi(res.body.accessToken)

    const add = await api.post('/api/favorites').send({ movieId: 1 })
    expect(add.status).toBe(200)

    const dup = await api.post('/api/favorites').send({ movieId: 1 })
    expect(dup.status).toBe(400)

    const list = await api.get('/api/favorites')
    expect(list.status).toBe(200)
    expect(list.body.data).toHaveLength(1)
    expect(list.body.data[0].movieId).toBe(1)
    // 后端联表已返回电影信息，前端无需再拉整表 join
    expect(list.body.data[0].title).toBe('肖申克的救赎')
    expect(list.body.data[0].documentId).toBeDefined()

    const del = await api.delete(`/api/favorites/${list.body.data[0].documentId}`)
    expect(del.status).toBe(204)

    const after = await api.get('/api/favorites')
    expect(after.body.data).toHaveLength(0)
  })

  it('不存在的电影不能收藏', async () => {
    const { username, password } = await createUser()
    const { res } = await login(username, password)
    const api = getApi(res.body.accessToken)
    const res2 = await api.post('/api/favorites').send({ movieId: 999999 })
    expect(res2.status).toBe(400)
  })
})