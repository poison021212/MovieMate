/**
 * TMDB -> MySQL 增量同步脚本
 *
 * 兼容旧用法：
 *   node scripts/syncTmdbMovies.js 5
 *
 * 新用法：
 *   node scripts/syncTmdbMovies.js --jobs popular,top_rated --pages 3
 *   node scripts/syncTmdbMovies.js --job now_playing --pages 2 --language zh-CN --region CN
 */

const path = require('path')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const db = require('../db')

const TMDB_TOKEN = process.env.TMDB_ACCESS_TOKEN
const TMDB_BASE = 'https://api.themoviedb.org/3'
const DEFAULT_DELAY_MS = 250

if (!TMDB_TOKEN) {
  console.error('缺少 TMDB_ACCESS_TOKEN，请先配置 server/.env')
  process.exit(1)
}

const JOB_ENDPOINT_MAP = {
  popular: '/movie/popular',
  top_rated: '/movie/top_rated',
  now_playing: '/movie/now_playing',
  upcoming: '/movie/upcoming',
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseCliArgs(argv) {
  const args = argv.slice(2)
  const options = {
    jobs: ['popular'],
    pages: 5,
    language: 'zh-CN',
    region: 'CN',
    delayMs: DEFAULT_DELAY_MS,
  }

  if (args[0] && /^\d+$/.test(args[0])) {
    options.pages = Math.max(Number(args[0]), 1)
    return options
  }

  for (let i = 0; i < args.length; i++) {
    const token = args[i]
    const next = args[i + 1]
    if ((token === '--job' || token === '--jobs') && next) {
      options.jobs = next
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      i += 1
      continue
    }
    if (token === '--pages' && next) {
      options.pages = Math.max(Number(next) || 1, 1)
      i += 1
      continue
    }
    if (token === '--language' && next) {
      options.language = next
      i += 1
      continue
    }
    if (token === '--region' && next) {
      options.region = next
      i += 1
      continue
    }
    if (token === '--delayMs' && next) {
      options.delayMs = Math.max(Number(next) || DEFAULT_DELAY_MS, 0)
      i += 1
    }
  }

  options.jobs = options.jobs.filter((job) => Object.prototype.hasOwnProperty.call(JOB_ENDPOINT_MAP, job))
  if (!options.jobs.length) options.jobs = ['popular']
  return options
}

async function tmdbFetch(endpoint, page, options) {
  const query = new URLSearchParams({
    language: options.language,
    region: options.region,
    page: String(page),
  })
  const url = `${TMDB_BASE}${endpoint}?${query.toString()}`

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      'Content-Type': 'application/json',
    },
  })
  if (!resp.ok) {
    throw new Error(`TMDB 请求失败 endpoint=${endpoint} page=${page} status=${resp.status}`)
  }
  return resp.json()
}

function mapMovie(m) {
  return {
    tmdb_id: m.id ?? null,
    title: m.title || m.original_title || '未知标题',
    original_title: m.original_title || null,
    original_language: m.original_language || null,
    release_date: m.release_date || null,
    popularity: m.popularity ?? null,
    vote_count: m.vote_count ?? null,
    rating: m.vote_average ?? 0,
    poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    backdrop_path: m.backdrop_path || null,
    summary: m.overview || null,
    year: m.release_date ? String(m.release_date).slice(0, 4) : null,
  }
}

async function getMovieTableColumns() {
  const [rows] = await db.query('SHOW COLUMNS FROM movies')
  return new Set(rows.map((item) => item.Field))
}

async function upsertMovie(movie, columns) {
  if (!movie.title) return false
  const hasTmdbId = columns.has('tmdb_id')

  let existingId = null
  if (hasTmdbId && movie.tmdb_id) {
    const [rows] = await db.query('SELECT id FROM movies WHERE tmdb_id = ? LIMIT 1', [movie.tmdb_id])
    existingId = rows[0]?.id ?? null
  } else {
    const [rows] = await db.query('SELECT id FROM movies WHERE title = ? AND year <=> ? LIMIT 1', [
      movie.title,
      movie.year,
    ])
    existingId = rows[0]?.id ?? null
  }

  const fieldMap = {
    tmdb_id: movie.tmdb_id,
    title: movie.title,
    original_title: movie.original_title,
    original_language: movie.original_language,
    release_date: movie.release_date,
    popularity: movie.popularity,
    vote_count: movie.vote_count,
    rating: movie.rating,
    poster: movie.poster,
    backdrop_path: movie.backdrop_path,
    summary: movie.summary,
    year: movie.year,
  }

  if (existingId) {
    const clauses = []
    const params = []
    Object.keys(fieldMap).forEach((field) => {
      if (!columns.has(field)) return
      clauses.push(`${field} = ?`)
      params.push(fieldMap[field])
    })
    if (clauses.length > 0) {
      await db.query(`UPDATE movies SET ${clauses.join(', ')} WHERE id = ?`, [...params, existingId])
    }
    return true
  }

  const insertPayload = {}
  Object.keys(fieldMap).forEach((field) => {
    if (columns.has(field)) insertPayload[field] = fieldMap[field]
  })
  if (!insertPayload.title) return false

  const keys = Object.keys(insertPayload)
  const placeholders = keys.map(() => '?').join(', ')
  await db.query(
    `INSERT INTO movies (${keys.join(', ')}) VALUES (${placeholders})`,
    keys.map((key) => insertPayload[key])
  )
  return true
}

async function runJob(jobName, options, columns) {
  const endpoint = JOB_ENDPOINT_MAP[jobName]
  let fetched = 0
  let upserted = 0
  let successPages = 0
  let failedPages = 0

  console.log(`\n=== 任务开始: ${jobName}, 页数=${options.pages} ===`)

  for (let page = 1; page <= options.pages; page++) {
    try {
      const data = await tmdbFetch(endpoint, page, options)
      const list = Array.isArray(data.results) ? data.results : []
      fetched += list.length

      for (const item of list) {
        const ok = await upsertMovie(mapMovie(item), columns)
        if (ok) upserted += 1
      }

      successPages += 1
      console.log(`[${jobName}] page=${page} 成功, fetched=${list.length}`)
    } catch (err) {
      failedPages += 1
      console.error(`[${jobName}] page=${page} 失败: ${err.message}`)
    }
    await sleep(options.delayMs)
  }

  return { jobName, fetched, upserted, successPages, failedPages }
}

async function main() {
  const options = parseCliArgs(process.argv)
  const columns = await getMovieTableColumns()
  const results = []

  console.log(
    `开始 TMDB 增量同步 jobs=${options.jobs.join(',')} pages=${options.pages} language=${options.language} region=${options.region}`
  )

  for (const jobName of options.jobs) {
    results.push(await runJob(jobName, options, columns))
  }

  const totals = results.reduce(
    (acc, item) => {
      acc.fetched += item.fetched
      acc.upserted += item.upserted
      acc.successPages += item.successPages
      acc.failedPages += item.failedPages
      return acc
    },
    { fetched: 0, upserted: 0, successPages: 0, failedPages: 0 }
  )

  const [rows] = await db.query('SELECT COUNT(*) AS total FROM movies')
  const totalInDb = rows[0]?.total ?? 0

  console.log('\n------------------------------')
  results.forEach((item) => {
    console.log(
      `[${item.jobName}] fetched=${item.fetched}, upserted=${item.upserted}, successPages=${item.successPages}, failedPages=${item.failedPages}`
    )
  })
  console.log(
    `汇总: fetched=${totals.fetched}, upserted=${totals.upserted}, successPages=${totals.successPages}, failedPages=${totals.failedPages}`
  )
  console.log(`当前数据库 movies 总数=${totalInDb}`)
  console.log('------------------------------\n')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('同步任务异常退出:', err)
    process.exit(1)
  })
