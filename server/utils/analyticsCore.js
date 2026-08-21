const db = require('../db/index.js')
const { getHybridSearchMetricsSnapshotAsync } = require('./hybridSearchMetrics.js')
const { buildTasteProfile } = require('./recommendCore.js')
const { hasLlm, chatCompletionsText } = require('./llmClient.js')

async function getMovieColumns() {
  const [rows] = await db.query('SHOW COLUMNS FROM movies')
  return new Set(rows.map((r) => r.Field))
}

async function getGenreDistribution() {
  const [rows] = await db.query(
    `SELECT genre, COUNT(*) AS count
     FROM movies
     WHERE genre IS NOT NULL AND genre <> ''
     GROUP BY genre
     ORDER BY count DESC
     LIMIT 12`
  )
  return rows.map((r) => ({ genre: r.genre, count: Number(r.count) }))
}

async function getYearTrends() {
  const columns = await getMovieColumns()
  const popExpr = columns.has('popularity') ? 'AVG(popularity)' : 'NULL'
  const [rows] = await db.query(
    `SELECT year,
            COUNT(*) AS count,
            AVG(rating) AS avgRating,
            ${popExpr} AS avgPopularity
     FROM movies
     WHERE year IS NOT NULL AND year <> '' AND year REGEXP '^[0-9]{4}$'
     GROUP BY year
     ORDER BY year ASC`
  )
  return rows.map((r) => ({
    year: r.year,
    count: Number(r.count),
    avgRating: r.avgRating != null ? Number(Number(r.avgRating).toFixed(2)) : null,
    avgPopularity: r.avgPopularity != null ? Number(Number(r.avgPopularity).toFixed(2)) : null,
  }))
}

async function getTopPopular(limit = 10) {
  const columns = await getMovieColumns()
  const orderExpr = columns.has('popularity')
    ? 'popularity DESC, rating DESC'
    : 'rating DESC, id ASC'
  const [rows] = await db.query(
    `SELECT id, title, genre, year, rating,
            ${columns.has('popularity') ? 'popularity' : 'NULL AS popularity'},
            ${columns.has('vote_count') ? 'vote_count' : 'NULL AS vote_count'}
     FROM movies
     ORDER BY ${orderExpr}
     LIMIT ?`,
    [limit]
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    genre: r.genre,
    year: r.year,
    rating: Number(r.rating),
    popularity: r.popularity != null ? Number(r.popularity) : null,
    voteCount: r.vote_count != null ? Number(r.vote_count) : null,
  }))
}

function linearForecast(values, horizon = 3) {
  const n = values.length
  if (n < 2) {
    const last = values[0] ?? 0
    return Array.from({ length: horizon }, (_, i) => Number((last * (1 + 0.02 * (i + 1))).toFixed(2)))
  }
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumXX += i * i
  }
  const denom = n * sumXX - sumX * sumX
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  const forecast = []
  for (let i = 0; i < horizon; i++) {
    forecast.push(Number((intercept + slope * (n + i)).toFixed(2)))
  }
  return forecast
}

function weightedMovingAverage(values, weights = [0.5, 0.3, 0.2]) {
  if (!values.length) return 0
  const slice = values.slice(-weights.length)
  const w = weights.slice(-slice.length)
  const totalW = w.reduce((a, b) => a + b, 0)
  return slice.reduce((sum, v, i) => sum + v * w[i], 0) / totalW
}

const MIN_SNAPSHOT_POINTS = 5

async function callQwenJson(messages) {
  if (!hasLlm()) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    return await chatCompletionsText({
      messages,
      temperature: 0.3,
      signal: controller.signal,
    })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function buildBaselineForecast(values, horizon) {
  const wma = weightedMovingAverage(values)
  const linear = linearForecast(values.length ? values : [wma], horizon)
  return linear.map((v, i) => ({ bucket: `预测+${i + 1}`, value: v }))
}

function clampAiPoints(rawPoints, historyValues, horizon) {
  if (!Array.isArray(rawPoints) || rawPoints.length !== horizon) return null
  const minV = Math.min(...historyValues)
  const maxV = Math.max(...historyValues)
  const lo = minV * 0.5
  const hi = maxV * 1.5
  const baseline = buildBaselineForecast(historyValues, horizon)
  const aiForecast = []
  for (let i = 0; i < horizon; i++) {
    let v = Number(rawPoints[i])
    if (!Number.isFinite(v) || v < lo || v > hi) {
      v = baseline[i].value
    }
    aiForecast.push({ bucket: `AI+${i + 1}`, value: Number(v.toFixed(2)) })
  }
  return aiForecast
}

async function getAiConstrainedForecast(historyValues, horizon, genreLabel) {
  const content = await callQwenJson([
    {
      role: 'system',
      content:
        '你是数据分析助手。根据给定的历史热度序列，只输出 JSON：{"points":[数值数组],"explanation":"一两句中文"}。' +
        'points 长度必须等于 horizon，每个值必须在历史 min*0.5 与 max*1.5 之间，禁止编造无关事实。',
    },
    {
      role: 'user',
      content: JSON.stringify({
        genre: genreLabel,
        horizon,
        history: historyValues,
        min: Math.min(...historyValues),
        max: Math.max(...historyValues),
      }),
    },
  ])
  if (!content) return null
  const match = String(content).match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    const aiForecast = clampAiPoints(parsed.points, historyValues, horizon)
    if (!aiForecast) return null
    return {
      aiForecast,
      explanation: String(parsed.explanation || '').slice(0, 300),
    }
  } catch {
    return null
  }
}

async function getForecastSeries({ genre = '', horizon = 3 } = {}) {
  const safeHorizon = Math.min(Math.max(Number(horizon) || 3, 1), 6)
  const genreFilter = genre ? genre.trim() : ''

  let history = []
  try {
    const params = []
    let sql = `SELECT snapshot_date AS bucket, avg_popularity AS value
               FROM analytics_snapshots
               WHERE avg_popularity IS NOT NULL`
    if (genreFilter) {
      sql += ' AND genre = ?'
      params.push(genreFilter)
    } else {
      sql += ' AND genre IS NULL'
    }
    sql += ' ORDER BY snapshot_date ASC LIMIT 24'
    const [snapRows] = await db.query(sql, params)
    history = snapRows.map((r) => ({
      bucket: String(r.bucket).slice(0, 10),
      value: Number(Number(r.value).toFixed(2)),
    }))
  } catch {
    history = []
  }

  const isSnapshotSeries =
    history.length > 0 && history.every((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.bucket))

  if (!isSnapshotSeries || history.length < MIN_SNAPSHOT_POINTS) {
    return {
      genre: genreFilter || '全部',
      source: 'snapshots',
      method: 'insufficient-data',
      insufficient: true,
      minPointsRequired: MIN_SNAPSHOT_POINTS,
      history,
      forecast: [],
      baseline: [],
      aiForecast: [],
      explanation: '快照数据不足，暂不预测。请运行 node server/scripts/snapshotAnalytics.js --days 7 生成日快照。',
    }
  }

  const values = history.map((h) => h.value)
  const wma = weightedMovingAverage(values)
  const baseline = buildBaselineForecast(values, safeHorizon)
  const forecast = baseline

  let method = 'wma+linear'
  let aiForecast = []
  let explanation = '统计基线：加权移动平均 + 线性外推。'

  const aiResult = await getAiConstrainedForecast(values, safeHorizon, genreFilter || '全部')
  if (aiResult) {
    method = 'ai-constrained'
    aiForecast = aiResult.aiForecast
    explanation = aiResult.explanation || explanation
  }

  return {
    genre: genreFilter || '全部',
    source: 'snapshots',
    method,
    insufficient: false,
    history,
    forecast,
    baseline,
    aiForecast,
    explanation,
    baselineWma: Number(wma.toFixed(2)),
  }
}

async function getTrendSummary({ genre = '' } = {}) {
  const [genres, years, top] = await Promise.all([
    getGenreDistribution(),
    getYearTrends(),
    getTopPopular(5),
  ])
  const forecast = await getForecastSeries({ genre, horizon: 3 })
  return {
    totalGenres: genres.length,
    topGenres: genres.slice(0, 5),
    recentYears: years.slice(-5),
    topMovies: top,
    forecastHint: forecast.insufficient ? null : forecast.forecast[0]?.value ?? null,
  }
}

async function getMeTaste(username) {
  const tasteProfile = await buildTasteProfile(username)
  if (!tasteProfile) {
    return { tasteProfile: null, genreRadar: [], favoritesCount: 0, reviewsCount: 0 }
  }

  const [favCountRows] = await db.query(
    'SELECT COUNT(*) AS c FROM favorites WHERE username = ?',
    [username]
  )
  const [revCountRows] = await db.query(
    'SELECT COUNT(*) AS c FROM reviews WHERE username = ?',
    [username]
  )

  const genreRadar = (tasteProfile.topGenres || []).map((g) => ({ genre: g, score: 1 }))
  const [genreRows] = await db.query(
    `SELECT m.genre, COUNT(*) AS count
     FROM favorites f
     JOIN movies m ON m.id = f.movieId
     WHERE f.username = ? AND m.genre IS NOT NULL
     GROUP BY m.genre`,
    [username]
  )
  const radarFromDb = genreRows.map((r) => ({
    genre: r.genre,
    score: Number(r.count),
  }))

  return {
    tasteProfile: {
      topGenres: tasteProfile.topGenres,
      yearRange: tasteProfile.yearRange,
      avgReviewRating: tasteProfile.avgReviewRating,
      positiveReviews: tasteProfile.positiveReviews,
    },
    genreRadar: radarFromDb.length ? radarFromDb : genreRadar,
    favoritesCount: Number(favCountRows[0]?.c || 0),
    reviewsCount: Number(revCountRows[0]?.c || 0),
  }
}

async function getMeRatings(username) {
  const [rows] = await db.query(
    `SELECT rating, COUNT(*) AS count
     FROM reviews
     WHERE username = ?
     GROUP BY rating
     ORDER BY rating ASC`,
    [username]
  )
  return rows.map((r) => ({ rating: Number(r.rating), count: Number(r.count) }))
}

async function getMeActivity(username) {
  const [reviewRows] = await db.query(
    `SELECT DATE(date) AS day, COUNT(*) AS count
     FROM reviews
     WHERE username = ?
     GROUP BY DATE(date)
     ORDER BY day ASC
     LIMIT 30`,
    [username]
  )
  return reviewRows.map((r) => ({
    day: String(r.day).slice(0, 10),
    count: Number(r.count),
  }))
}

async function getMeAiUsage(username) {
  const [rows] = await db.query(
    `SELECT DATE(m.created_at) AS day,
            COUNT(*) AS messages,
            AVG(JSON_EXTRACT(m.meta_json, '$.groundedCount')) AS avgGrounded
     FROM ai_recommend_messages m
     JOIN ai_recommend_sessions s ON s.id = m.session_id
     WHERE s.username = ? AND m.role = 'assistant'
     GROUP BY DATE(m.created_at)
     ORDER BY day ASC
     LIMIT 30`,
    [username]
  )
  return rows.map((r) => ({
    day: String(r.day).slice(0, 10),
    messages: Number(r.messages),
    avgGrounded: r.avgGrounded != null ? Number(Number(r.avgGrounded).toFixed(1)) : null,
  }))
}

async function getPlatformOverview() {
  const [movieCountRows] = await db.query('SELECT COUNT(*) AS c FROM movies')
  const [reviewCountRows] = await db.query('SELECT COUNT(*) AS c FROM reviews')
  const [userCountRows] = await db.query('SELECT COUNT(*) AS c FROM users')
  return {
    movieCount: Number(movieCountRows[0]?.c || 0),
    reviewCount: Number(reviewCountRows[0]?.c || 0),
    userCount: Number(userCountRows[0]?.c || 0),
    hybrid: await getHybridSearchMetricsSnapshotAsync(),
  }
}

module.exports = {
  getGenreDistribution,
  getYearTrends,
  getTopPopular,
  getForecastSeries,
  getTrendSummary,
  getMeTaste,
  getMeRatings,
  getMeActivity,
  getMeAiUsage,
  getPlatformOverview,
}
