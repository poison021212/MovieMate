import { describe, it, expect, beforeEach } from 'vitest'
import { request, app, createUser, login, getApi, truncateAll } from './helpers.js'

describe('影评', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('未登录发表评论返回 401', async () => {
    const res = await request(app).post('/api/reviews').send({ movieId: 1, rating: 8, content: '未登录' })
    expect(res.status).toBe(401)
  })

  it('发表评论后可按 movieId / username 服务端筛选,空结果返回空数组而非报错', async () => {
    const { username, password } = await createUser()
    const { res } = await login(username, password)
    const api = getApi(res.body.accessToken)

    const add1 = await api.post('/api/reviews').send({ movieId: 1, rating: 8, content: '很好看的电影' })
    expect(add1.status).toBe(201)
    const add2 = await api.post('/api/reviews').send({ movieId: 2, rating: 7, content: '也不错' })
    expect(add2.status).toBe(201)

    const byMovie = await request(app).get('/api/reviews').query({ movieId: 1 })
    expect(byMovie.status).toBe(200)
    expect(byMovie.body.data).toHaveLength(1)
    expect(byMovie.body.data[0].movieId).toBe(1)
    expect(byMovie.body.data[0].documentId).toBeDefined()

    const byUser = await request(app).get('/api/reviews').query({ username })
    expect(byUser.body.data).toHaveLength(2)

    // 空列表必须返回 {data: []}，不再双 res.success 引发 headers-sent 500
    const empty = await request(app).get('/api/reviews').query({ movieId: 999 })
    expect(empty.status).toBe(200)
    expect(empty.body.data).toEqual([])
  })

  it('只能删除自己的评论', async () => {
    const userA = await createUser({ username: 'alice_rv', email: 'alice_rv@example.com' })
    const userB = await createUser({ username: 'bob_rv', email: 'bob_rv@example.com' })
    const loginA = await login(userA.username, userA.password)
    const loginB = await login(userB.username, userB.password)
    const apiA = getApi(loginA.res.body.accessToken)
    const apiB = getApi(loginB.res.body.accessToken)

    const add = await apiA.post('/api/reviews').send({ movieId: 1, rating: 9, content: 'A 的评论' })
    const reviewId = add.body.data.documentId

    const delByB = await apiB.delete(`/api/reviews/${reviewId}`)
    expect(delByB.status).toBe(404)

    const delByA = await apiA.delete(`/api/reviews/${reviewId}`)
    expect(delByA.status).toBe(204)
  })

  it('删除时非数字 id 被校验拦截(400)', async () => {
    const { username, password } = await createUser()
    const { res } = await login(username, password)
    const api = getApi(res.body.accessToken)
    const res2 = await api.delete('/api/reviews/abc')
    expect(res2.status).toBe(400)
  })

  it('评论不存在的电影返回 400', async () => {
    const { username, password } = await createUser()
    const { res } = await login(username, password)
    const api = getApi(res.body.accessToken)
    const res2 = await api.post('/api/reviews').send({ movieId: 999999, rating: 8, content: '不存在' })
    expect(res2.status).toBe(400)
  })
})