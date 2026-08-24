/**
 * 豆瓣电影离线种子导入脚本
 *
 * 用途:把豆瓣抓取数据(douban_movie_item.json,非标准 JSON:一行一个对象)
 * 清洗成 movies 表字段并幂等落库,作为 TMDB 不可达时的本地兜底数据。
 *
 * 用法:
 *   node scripts/importDoubanSeed.js                       # 只清洗 + 写种子 + 落库
 *   node scripts/importDoubanSeed.js --with-posters        # 顺便按豆瓣 movie_id 补海报
 *   node scripts/importDoubanSeed.js --input ../douban_movie_item.json --max 10 --delay-ms 800
 *
 * 幂等:按 title + year 匹配,已存在则仅补非空缺失字段,不会产生重复行。
 * 代理:识别 HTTPS_PROXY / HTTP_PROXY(复用 syncTmdbMovies 的 undici ProxyAgent 模式)。
 */

const fs = require('fs')
const path = require('path')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const db = require('../db')

// ---------------- 1. 参数与服务配置 ----------------
const DEFAULT_INPUT = path.join(__dirname, '..', '..', 'douban_movie_item.json')
const DEFAULT_OUT = path.join(__dirname, '..', 'data', 'douban_seed.json')
const DOUBAN_BASE = 'https://movie.douban.com'
const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_TOKEN = process.env.TMDB_ACCESS_TOKEN
const DEFAULT_DELAY_MS = 600
const MAX_ACTORS = 8
const DOUBAN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function parseCliArgs(argv) {
  const args = argv.slice(2)
  const options = {
    input: DEFAULT_INPUT,
    out: DEFAULT_OUT,
    withPosters: false,
    max: 0, // 0 = 全部
    delayMs: DEFAULT_DELAY_MS,
  }
  for (let i = 0; i < args.length; i++) {
    const token = args[i]
    const next = args[i + 1]
    if (token === '--with-posters') options.withPosters = true
    else if (token === '--input' && next) { options.input = next; i += 1 }
    else if (token === '--out' && next) { options.out = next; i += 1 }
    else if (token === '--max' && next) { options.max = Math.max(Number(next) || 0, 0); i += 1 }
    else if ((token === '--delay-ms' || token === '--delayMs') && next) { options.delayMs = Math.max(Number(next) || 0, 0); i += 1 }
    else if (token === '--proxy' && next) { process.env.HTTPS_PROXY = next; process.env.HTTP_PROXY = next; i += 1 }
  }
  return options
}

// ---------------- 2. 代理与网络请求 ----------------
const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || ''
let httpFetch = fetch

if (PROXY_URL) {
  try {
    const { ProxyAgent, fetch: undiciFetch } = require('undici')
    const proxyAgent = new ProxyAgent(PROXY_URL)
    httpFetch = (url, init) => undiciFetch(url, { ...init, dispatcher: proxyAgent })
    console.log(`[代理] 网络请求经代理: ${PROXY_URL}`)
  } catch (err) {
    console.warn(`[代理] 代理配置无效,将直连: ${err.message}`)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------- 3. 解析(非标准 JSON:一行一个对象) ----------------
function parseDoubanFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`找不到输入文件: ${filePath}`)
  }
  const text = fs.readFileSync(filePath, 'utf8')
  const records = []
  let failed = 0
  const failLines = []

  text.split('\n').forEach((line, idx) => {
    const trimmed = line.trim()
    if (!trimmed) return
    try {
      records.push({ line: idx + 1, record: JSON.parse(trimmed) })
    } catch {
      failed += 1
      failLines.push(idx + 1)
    }
  })

  return { records, failed, failLines }
}

// ---------------- 4. 清洗映射(豆瓣字段 -> movies 表字段) ----------------
function collapseWhitespace(str) {
  return String(str || '').replace(/\s+/g, ' ').trim()
}

function pickFirst(value) {
  if (Array.isArray(value)) return value[0]
  if (value == null) return null
  return String(value)
}

function parseYear(releaseDate) {
  if (releaseDate == null) return null
  const m = String(releaseDate).match(/\d{4}/)
  return m ? m[0] : null
}

function parseDuration(runtime) {
  const raw = pickFirst(runtime)
  if (raw == null) return null
  const m = String(raw).match(/(\d+)\s*分钟/)
  return m ? `${m[1]} 分钟` : collapseWhitespace(raw) || null
}

function parseRating(ratingNum) {
  const raw = pickFirst(ratingNum)
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : 0
}

function joinList(value, max = Infinity) {
  const arr = Array.isArray(value) ? value.slice(0, max) : value == null ? [] : [value]
  const cleaned = arr.map((v) => collapseWhitespace(v)).filter(Boolean)
  return cleaned.length ? cleaned.join(', ') : null
}

function buildSummary(intro) {
  const arr = Array.isArray(intro) ? intro : intro == null ? [] : [intro]
  const paragraphs = arr
    .map((p) => collapseWhitespace(p))
    .filter(Boolean)
  return paragraphs.length ? paragraphs.join('\n') : null
}

function extractDoubanId(movieId) {
  const raw = pickFirst(movieId)
  if (raw == null) return null
  const m = String(raw).match(/\d+/)
  return m ? m[0] : null
}

function cleanRecord(record) {
  const title = collapseWhitespace(pickFirst(record.movie_title))
  const releaseDate = pickFirst(record.release_date)
  const year = parseYear(releaseDate)

  return {
    title,
    year,
    rating: parseRating(record.rating_num),
    duration: parseDuration(record.runtime),
    genre: joinList(Array.isArray(record.genre) ? record.genre : record.genre),
    director: joinList(record.directedBy),
    actors: joinList(record.starring, MAX_ACTORS),
    summary: buildSummary(record.intro),
    poster: null, // 由 --with-posters 补充
    doubanId: extractDoubanId(record.movie_id),
    country: record.country || null,
    language: Array.isArray(record.language) ? record.language.join(' / ') : record.language || null,
  }
}

// ---------------- 5. 幂等入库(title + year 匹配) ----------------
async function getMovieTableColumns() {
  const [rows] = await db.query('SHOW COLUMNS FROM movies')
  return new Set(rows.map((item) => item.Field))
}

const DB_FIELDS = ['title', 'year', 'rating', 'duration', 'genre', 'director', 'actors', 'summary', 'poster']

async function upsertMovie(movie, columns) {
  const payload = {}
  for (const field of DB_FIELDS) {
    if (columns.has(field) && movie[field] !== undefined && movie[field] !== null) {
      payload[field] = movie[field]
    }
  }
  if (!payload.title) return { action: 'skipped', id: null }

  // 无 tmdb_id 的数据按 title + year 匹配(与 movie.js persistTmdbMovies 一致,<=> 空安全等值)
  const [rows] = await db.query('SELECT id FROM movies WHERE title = ? AND year <=> ? LIMIT 1', [
    payload.title,
    payload.year,
  ])
  const existingId = rows[0]?.id ?? null

  if (existingId) {
    const clauses = []
    const params = []
    Object.keys(payload).forEach((field) => {
      if (field === 'title') return
      clauses.push(`${field} = ?`)
      params.push(payload[field])
    })
    if (clauses.length === 0) return { action: 'noop', id: existingId }
    if (columns.has('updated_at')) {
      clauses.push('updated_at = NOW()')
    }
    await db.query(`UPDATE movies SET ${clauses.join(', ')} WHERE id = ?`, [...params, existingId])
    return { action: 'updated', id: existingId }
  }

  const keys = Object.keys(payload)
  const placeholders = keys.map(() => '?').join(', ')
  const values = keys.map((key) => payload[key])
  const insertSql = (columns.has('updated_at') && !keys.includes('updated_at'))
    ? `INSERT INTO movies (${keys.join(', ')}, updated_at) VALUES (${placeholders}, NOW())`
    : `INSERT INTO movies (${keys.join(', ')}) VALUES (${placeholders})`

  const [result] = await db.query(insertSql, values)
  return { action: 'inserted', id: result.insertId }
}

// ---------------- 6. 海报补全(豆瓣 subject 页优先,TMDB 图片搜索回退) ----------------
let warnedTmdbMissing = false

async function fetchText(url, headers = {}) {
  const resp = await httpFetch(url, { headers })
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${url}`)
  }
  return resp.text()
}

async function extractDoubanPoster(doubanId) {
  const url = `${DOUBAN_BASE}/subject/${doubanId}/`
  const html = await fetchText(url, {
    'User-Agent': DOUBAN_UA,
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  })
  const ogMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+doubanio\.com[^"']+)["'][^>]+property=["']og:image["']/i)
  if (ogMatch) {
    return String(ogMatch[1]).split('?')[0]
  }
  const imgMatch = html.match(/<img[^>]+src=["'](https:[^"']*doubanio\.com[^"']*view\/photo[^"']*\.(?:jpg|jpeg|png|webp))["']/i)
  if (imgMatch) {
    return String(imgMatch[1]).split('?')[0]
  }
  return null
}

async function searchTmdbPoster(title) {
  if (!TMDB_TOKEN) {
    if (!warnedTmdbMissing) {
      console.warn('[海报] 未配置 TMDB_ACCESS_TOKEN,跳过 TMDB 图片回退')
      warnedTmdbMissing = true
    }
    return null
  }
  const url = `${TMDB_BASE}/search/movie?query=${encodeURIComponent(title)}&language=zh-CN&page=1`
  const resp = await httpFetch(url, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, 'Content-Type': 'application/json' },
  })
  if (!resp.ok) throw new Error(`TMDB 搜索失败: HTTP ${resp.status}`)
  const data = await resp.json()
  const first = Array.isArray(data.results) ? data.results.find((m) => m.poster_path) : null
  return first ? `https://image.tmdb.org/t/p/w500${first.poster_path}` : null
}

async function enrichPoster(doubanId, title) {
  let doubanUnreachable = false
  // 1. 豆瓣 subject 页 og:image / 海报图
  if (doubanId) {
    try {
      const poster = await extractDoubanPoster(doubanId)
      if (poster) return { ok: true, poster, source: 'douban', reason: null }
    } catch {
      doubanUnreachable = true // 反爬/超时,静默走 TMDB 回退
    }
  }
  // 2. TMDB 图片搜索
  try {
    const poster = await searchTmdbPoster(title.trim())
    if (poster) return { ok: true, poster, source: 'tmdb', reason: null }
    return { ok: false, poster: null, source: null, reason: 'tmdb-empty' }
  } catch {
    return { ok: false, poster: null, source: null, reason: doubanUnreachable ? 'both-unreachable' : 'tmdb-err' }
  }
}

// ---------------- 7. 主流程 ----------------
async function main() {
  const options = parseCliArgs(process.argv)

  console.log('===== 豆瓣种子导入 =====')
  console.log(`输入文件: ${options.input}`)

  const { records, failed, failLines } = parseDoubanFile(options.input)
  console.log(`解析到 ${records.length} 条${failed ? `, ${failed} 行解析失败(行:${failLines.slice(0, 10).join(',')})` : ''}`)
  if (!records.length) throw new Error('没有可用的记录,退出')

  const limited = options.max > 0 ? records.slice(0, options.max) : records
  if (options.max > 0) console.log(`--max ${options.max} 生效,仅处理前 ${limited.length} 条`)

  // 清洗
  let cleaned = limited.map(({ line, record }) => ({ line, data: cleanRecord(record) }))
  const skippedNoTitle = cleaned.filter((c) => !c.data.title)
  cleaned = cleaned.filter((c) => c.data.title)
  if (skippedNoTitle.length) console.warn(`跳过 ${skippedNoTitle.length} 条无标题记录`)

  // 写标准种子
  fs.mkdirSync(path.dirname(options.out), { recursive: true })
  fs.writeFileSync(options.out, JSON.stringify(cleaned.map((c) => c.data), null, 2), 'utf8')
  console.log(`标准种子已写入: ${options.out} (${cleaned.length} 条)`)

  // 落库
  const columns = await getMovieTableColumns()
  let inserted = 0
  let updated = 0
  let noop = 0
  let skipped = 0
  for (const { data } of cleaned) {
    const result = await upsertMovie(data, columns)
    if (result.action === 'inserted') inserted += 1
    else if (result.action === 'updated') updated += 1
    else if (result.action === 'noop') noop += 1
    else skipped += 1
    data._localId = result.id
  }
  console.log(`落库完成: 新增 ${inserted}, 更新 ${updated}, 无变化 ${noop}, 跳过 ${skipped}`)

  // 补海报
  if (options.withPosters) {
    console.log('[海报] 开始补充 --with-posters')
    let posterOk = 0
    let posterFail = 0
    const reasonCount = {}
    for (const { data } of cleaned) {
      if (!data._localId) continue
      const { ok, poster, source, reason } = await enrichPoster(data.doubanId, data.title)
      if (ok && poster) {
        data.poster = poster
        await db.query('UPDATE movies SET poster = ? WHERE id = ?', [poster, data._localId])
        posterOk += 1
        console.log(`   ✓ ${data.title} (${source})`)
      } else {
        posterFail += 1
        if (reason) reasonCount[reason] = (reasonCount[reason] || 0) + 1
        console.log(`   - ${data.title} 无海报,保留占位`)
      }
      if (options.delayMs > 0) await sleep(options.delayMs)
    }
    // 把补到的海报回写到标准种子,便于后续直接复用
    fs.writeFileSync(options.out, JSON.stringify(cleaned.map((c) => c.data), null, 2), 'utf8')
    const reasonText = Object.keys(reasonCount).length ? `, 失败原因: ${JSON.stringify(reasonCount)}` : ''
    console.log(`[海报] 完成: 补到 ${posterOk}, 未命中 ${posterFail}${reasonText}`)
    console.log('  提示: 未命中通常因豆瓣反爬验证或当前网络无法访问 TMDB,不影响主流程(前端有占位图)')
  }

  const [[count]] = await db.query('SELECT COUNT(*) AS total FROM movies')
  console.log(`当前 movies 表总数: ${count.total}`)
  console.log('===== 导入完成 =====')

  // 显式关闭连接池,避免 socket 挂起导致进程不退出
  await db.end().catch(() => {})
  process.exit(0)
}

main().catch((err) => {
  console.error('导入失败:', err)
  process.exit(1)
})