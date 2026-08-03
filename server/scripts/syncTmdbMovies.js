/**
 * TMDB -> MySQL 同步脚本（教学注释版）
 * 运行方式：
 *   node scripts/syncTmdbMovies.js 5
 * 其中 5 表示同步 5 页（每页约 20 条）
 */

const path = require('path')

// 1) 加载 server/.env，拿到 TMDB token 和数据库配置
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// 2) 复用你项目已有的数据库连接池（mysql2/promise）
const db = require('../db')

// 3) 常量配置：TMDB 地址、token、同步页数、节流时间
const TMDB_TOKEN = process.env.TMDB_ACCESS_TOKEN
const TMDB_BASE = 'https://api.themoviedb.org/3'
const maxPages = Number(process.argv[2] || 5) // 支持命令行传参
const delayMs = 250 // 每页后等待 250ms，避免请求过快

// 4) 启动前防呆：没 token 就直接退出（避免空跑）
if (!TMDB_TOKEN) {
  console.error('缺少 TMDB_ACCESS_TOKEN，请先配置 server/.env')
  process.exit(1)
}

// 5) 小工具：异步 sleep，用于节流
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 6) 拉取 TMDB 热门电影某一页
 * 为什么单独拆函数？
 * - 便于复用/测试
 * - 失败时能明确定位在哪一页请求异常
 */
async function fetchPopular(page) {
  const url = `${TMDB_BASE}/movie/popular?language=zh-CN&region=CN&page=${page}`

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      'Content-Type': 'application/json',
    },
  })

  if (!resp.ok) {
    throw new Error(`TMDB 请求失败 page=${page}, status=${resp.status}`)
  }

  return resp.json()
}

/**
 * 7) 字段映射：把 TMDB 原始结构转成你本地 movies 表结构
 * 重点：
 * - tmdb_id 作为外部唯一标识
 * - poster_path 拼成完整 URL，前端可直接显示
 * - 对空值做兜底，降低脏数据影响
 */
function mapMovie(m) {
  return {
    tmdb_id: m.id,
    title: m.title || m.original_title || '未知标题',
    original_title: m.original_title || null,
    original_language: m.original_language || null,
    release_date: m.release_date || null, // YYYY-MM-DD
    popularity: m.popularity ?? null,
    vote_count: m.vote_count ?? null,
    rating: m.vote_average ?? 0,
    poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    backdrop_path: m.backdrop_path || null,
    summary: m.overview || null,
  }
}

/**
 * 8) 幂等写入（最核心）
 * ON DUPLICATE KEY UPDATE + uk_movies_tmdb_id(tmbd_id)
 * - 没有记录 -> INSERT
 * - 已有记录 -> UPDATE
 * 这就是“可重复执行同步任务”的关键
 */
async function upsertMovie(movie) {
  const sql = `
    INSERT INTO movies
    (tmdb_id, title, original_title, original_language, release_date, popularity, vote_count, rating, poster, backdrop_path, summary, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      original_title = VALUES(original_title),
      original_language = VALUES(original_language),
      release_date = VALUES(release_date),
      popularity = VALUES(popularity),
      vote_count = VALUES(vote_count),
      rating = VALUES(rating),
      poster = VALUES(poster),
      backdrop_path = VALUES(backdrop_path),
      summary = VALUES(summary),
      updated_at = NOW()
  `

  const params = [
    movie.tmdb_id,
    movie.title,
    movie.original_title,
    movie.original_language,
    movie.release_date,
    movie.popularity,
    movie.vote_count,
    movie.rating,
    movie.poster,
    movie.backdrop_path,
    movie.summary,
  ]

  await db.query(sql, params)
}

/**
 * 9) 主流程
 * 顺序：
 * - 循环页码
 * - 每页拉取
 * - 每条 upsert
 * - 记录日志
 * - 单页失败不中断全局
 */
async function main() {
  console.log(`开始同步 TMDB 热门电影，页数=${maxPages}`)

  let totalFetched = 0
  let successPages = 0
  let failedPages = 0

  for (let page = 1; page <= maxPages; page++) {
    try {
      const data = await fetchPopular(page)
      const list = Array.isArray(data.results) ? data.results : []

      for (const item of list) {
        const movie = mapMovie(item)
        await upsertMovie(movie)
      }

      totalFetched += list.length
      successPages += 1
      console.log(`page=${page} 同步成功，条数=${list.length}`)
    } catch (err) {
      failedPages += 1
      console.error(`page=${page} 同步失败: ${err.message}`)
    }

    await sleep(delayMs)
  }

  // 10) 收尾：输出可观测结果，便于你验收和复盘
  const [rows] = await db.query('SELECT COUNT(*) AS total FROM movies')
  const totalInDb = rows[0]?.total ?? 0

  console.log('------------------------------')
  console.log(`同步完成：成功页=${successPages}，失败页=${failedPages}`)
  console.log(`本轮抓取条数(含更新)=${totalFetched}`)
  console.log(`当前数据库 movies 总数=${totalInDb}`)
  console.log('------------------------------')

  process.exit(0)
}

// 11) 全局兜底：捕获未处理异常
main().catch((err) => {
  console.error('同步任务异常退出:', err)
  process.exit(1)
})