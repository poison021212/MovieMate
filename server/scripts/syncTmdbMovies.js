/**
 * TMDB -> MySQL 增量同步脚本 (终极整合版)
 *
 * 特性：
 *   1. 支持命令行参数多任务：--jobs popular,now_playing
 *   2. 支持代理配置 (HTTP_PROXY / HTTPS_PROXY)
 *   3. 会对每条数据拉取 detail+credits 补全导演、演员、类型、时长等
 *   4. 动态检查数据库表字段，数据库缺少的字段会自动忽略，不会报错
 *
 * 旧用法兼容：
 *   node scripts/syncTmdbMovies.js 5
 *
 * 新用法示例：
 *   node scripts/syncTmdbMovies.js --jobs popular,top_rated --pages 3
 *   node scripts/syncTmdbMovies.js --job now_playing --pages 2 --language zh-CN --region CN --delayMs 300
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const db = require('../db')

const TMDB_TOKEN = process.env.TMDB_ACCESS_TOKEN
const TMDB_BASE = 'https://api.themoviedb.org/3'
const DEFAULT_DELAY_MS = 300

if (!TMDB_TOKEN) {
  console.error('缺少 TMDB_ACCESS_TOKEN，请先配置 server/.env')
  process.exit(1)
}

// ---------------- 1. 代理与网络请求配置 ----------------
const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || ''
let tmdbHttpFetch = fetch

if (PROXY_URL) {
  const { ProxyAgent, fetch: undiciFetch } = require('undici')
  const proxyAgent = new ProxyAgent(PROXY_URL)
  tmdbHttpFetch = (url, init) => undiciFetch(url, { ...init, dispatcher: proxyAgent })
  try {
    const u = new URL(PROXY_URL)
    const port = u.port || (u.protocol === 'https:' ? '443' : '80')
    console.log(`[代理设置] TMDB 请求经代理: ${u.hostname}:${port}`)
  } catch {
    console.log('[代理设置] TMDB 请求经代理已启用')
  }
}

async function tmdbFetch(url) {
  const resp = await tmdbHttpFetch(url, {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      'Content-Type': 'application/json',
    },
  })
  if (!resp.ok) {
    throw new Error(`TMDB 请求失败 url=${url}, status=${resp.status}`)
  }
  return resp.json()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------- 2. 命令行参数解析 ----------------
const JOB_ENDPOINT_MAP = {
  popular: '/movie/popular',
  top_rated: '/movie/top_rated',
  now_playing: '/movie/now_playing',
  upcoming: '/movie/upcoming',
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

  // 兼容旧用法： node script.js 5
  if (args[0] && /^\d+$/.test(args[0])) {
    options.pages = Math.max(Number(args[0]), 1)
    return options
  }

  for (let i = 0; i < args.length; i++) {
    const token = args[i]
    const next = args[i + 1]
    if ((token === '--job' || token === '--jobs') && next) {
      options.jobs = next.split(',').map((item) => item.trim()).filter(Boolean)
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

// ---------------- 3. 数据抓取与格式转换 ----------------
async function fetchGenreList(language) {
  const data = await tmdbFetch(`${TMDB_BASE}/genre/movie/list?language=${language}`)
  const map = {}
  for (const g of data.genres || []) {
    map[g.id] = g.name
  }
  return map
}

function yearFromReleaseDate(dateStr) {
  if (!dateStr || dateStr.length < 4) return null
  return dateStr.slice(0, 4)
}

function mapGenre(detail, genreById, listItem) {
  if (detail?.genres?.length) {
    return detail.genres.map((g) => g.name).join(', ')
  }
  const ids = listItem?.genre_ids
  if (Array.isArray(ids) && ids.length && genreById) {
    const names = ids.map((id) => genreById[id]).filter(Boolean)
    return names.length ? names.join(', ') : null
  }
  return null
}

function mapDirector(credits) {
  const crew = credits?.crew || []
  const names = crew.filter((c) => c.job === 'Director').map((c) => c.name)
  return names.length ? names.join(', ') : null
}

function mapActors(credits) {
  const cast = credits?.cast || []
  const names = cast.slice(0, 5).map((c) => c.name)
  return names.length ? names.join(', ') : null
}

function mapDuration(runtime) {
  if (runtime == null || runtime === 0) return null
  return `${runtime} 分钟`
}

function mapMovie(listItem, detail, genreById) {
  const releaseDate = detail?.release_date || listItem.release_date || null
  const credits = detail?.credits || {}

  return {
    tmdb_id: listItem.id ?? null,
    title: listItem.title || listItem.original_title || detail?.title || '未知标题',
    original_title: listItem.original_title || detail?.original_title || null,
    original_language: listItem.original_language || detail?.original_language || null,
    release_date: releaseDate,
    popularity: listItem.popularity ?? detail?.popularity ?? null,
    vote_count: listItem.vote_count ?? detail?.vote_count ?? null,
    rating: listItem.vote_average ?? detail?.vote_average ?? 0,
    poster: (listItem.poster_path || detail?.poster_path)
      ? `https://image.tmdb.org/t/p/w500${listItem.poster_path || detail.poster_path}`
      : null,
    backdrop_path: listItem.backdrop_path || detail?.backdrop_path || null,
    summary: listItem.overview ?? detail?.overview ?? null,
    year: yearFromReleaseDate(releaseDate),
    genre: mapGenre(detail, genreById, listItem),
    duration: mapDuration(detail?.runtime),
    director: mapDirector(credits),
    actors: mapActors(credits),
  }
}

// ---------------- 4. 数据库动态操作 ----------------
async function getMovieTableColumns() {
  const [rows] = await db.query('SHOW COLUMNS FROM movies')
  return new Set(rows.map((item) => item.Field))
}

async function upsertMovie(movie, columns) {
  if (!movie.title) return false
  const hasTmdbId = columns.has('tmdb_id')

  // 1. 判断数据库中是否已存在该条记录
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

  // 只提取数据库中实际存在的字段进行操作，防止报错
  const insertPayload = {}
  Object.keys(movie).forEach((field) => {
    if (columns.has(field) && movie[field] !== undefined) {
      insertPayload[field] = movie[field]
    }
  })

  // 2. 如果存在，执行 UPDATE
  if (existingId) {
    const clauses = []
    const params = []
    Object.keys(insertPayload).forEach((field) => {
      clauses.push(`${field} = ?`)
      params.push(insertPayload[field])
    })

    // 如果有 updated_at 字段，手动触发更新时间
    if (columns.has('updated_at')) {
      clauses.push(`updated_at = NOW()`)
    }

    if (clauses.length > 0) {
      await db.query(`UPDATE movies SET ${clauses.join(', ')} WHERE id = ?`, [...params, existingId])
    }
    return true
  }

  // 3. 如果不存在，执行 INSERT
  const keys = Object.keys(insertPayload)
  if (keys.length === 0) return false

  let placeholders = keys.map(() => '?').join(', ')
  let insertKeys = keys.join(', ')
  const values = keys.map((key) => insertPayload[key])

  // 如果有 updated_at 字段，插入当前时间
  if (columns.has('updated_at')) {
    insertKeys += ', updated_at'
    placeholders += ', NOW()'
  }

  await db.query(`INSERT INTO movies (${insertKeys}) VALUES (${placeholders})`, values)
  return true
}

// ---------------- 5. 任务调度逻辑 ----------------
async function runJob(jobName, options, columns, genreById) {
  const endpoint = JOB_ENDPOINT_MAP[jobName]
  let fetched = 0
  let upserted = 0
  let successPages = 0
  let failedPages = 0

  console.log(`\n=== 任务开始: ${jobName}, 目标页数=${options.pages} ===`)

  for (let page = 1; page <= options.pages; page++) {
    try {
      // 1. 获取列表
      const listQuery = new URLSearchParams({ language: options.language, region: options.region, page: String(page) })
      const listData = await tmdbFetch(`${TMDB_BASE}${endpoint}?${listQuery.toString()}`)
      const list = Array.isArray(listData.results) ? listData.results : []
      fetched += list.length

      // 2. 遍历列表抓取详情并入库
      for (const item of list) {
        // 抓取详情获取 credits (导演、演员)
        const detailQuery = new URLSearchParams({ language: options.language, append_to_response: 'credits' })
        const detailUrl = `${TMDB_BASE}/movie/${item.id}?${detailQuery.toString()}`
        let detail = null

        try {
          detail = await tmdbFetch(detailUrl)
        } catch (e) {
          console.warn(`    获取详情失败 TMDB_ID=${item.id}: ${e.message}`)
        }

        // 合并数据并存入数据库
        const movieData = mapMovie(item, detail, genreById)
        const ok = await upsertMovie(movieData, columns)
        if (ok) upserted += 1

        // 每次抓取详情后等待，防止频繁请求被封禁
        await sleep(options.delayMs)
      }

      successPages += 1
      console.log(`[${jobName}] page=${page} 完成, 本页入库=${list.length}`)
    } catch (err) {
      failedPages += 1
      console.error(`[${jobName}] page=${page} 失败: ${err.message}`)
      await sleep(options.delayMs) // 失败也稍微等待
    }
  }

  return { jobName, fetched, upserted, successPages, failedPages }
}

// ---------------- 6. 主程序 ----------------
async function main() {
  const options = parseCliArgs(process.argv)
  const columns = await getMovieTableColumns()
  const results = []

  console.log(
    `开始 TMDB 增量同步:\n - 任务队列: ${options.jobs.join(', ')}\n - 抓取页数: ${options.pages}\n - 语言/地区: ${options.language} / ${options.region}\n - 延迟间隔: ${options.delayMs}ms`
  )

  // 获取 Genre 字典
  let genreById = {}
  try {
    genreById = await fetchGenreList(options.language)
    console.log(`已加载 TMDB 类型字典，共 ${Object.keys(genreById).length} 项`)
  } catch (err) {
    console.warn(`类型字典加载失败，将仅使用详情中的 genres: ${err.message}`)
  }

  // 运行所有指定任务
  for (const jobName of options.jobs) {
    results.push(await runJob(jobName, options, columns, genreById))
  }

  // 统计结果
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
  console.log('同步统计报告：')
  results.forEach((item) => {
    console.log(
      ` - [${item.jobName.padEnd(12)}] 获取=${item.fetched}, 入库=${item.upserted}, 成功页=${item.successPages}, 失败页=${item.failedPages}`
    )
  })
  console.log('------------------------------')
  console.log(`总计汇总: 抓取记录=${totals.fetched}, 成功入库=${totals.upserted}`)
  console.log(`数据库影片总数: ${totalInDb}`)
  console.log('------------------------------\n')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('同步任务异常退出:', err)
    process.exit(1)
  })