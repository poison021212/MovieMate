import { describe, it, expect } from 'vitest'
import { request, app } from './helpers.js'

describe('电影列表', () => {
  it('pageSize 超过上限被钳制到 100', async () => {
    const res = await request(app).get('/api/movies').query({ pageSize: 99999 })
    expect(res.status).toBe(200)
    expect(res.body.pagination.pageSize).toBe(100)
    // init.sql 种子的 3 部示例电影
    expect(res.body.data).toHaveLength(3)
  })

  it('未指定时默认每页 12 条', async () => {
    const res = await request(app).get('/api/movies').query({ page: 1 })
    expect(res.status).toBe(200)
    expect(res.body.pagination.pageSize).toBe(12)
  })
})