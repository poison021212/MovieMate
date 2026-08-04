const db = require('../db/index.js')
const { resolveLocalMovieIdsForCandidates } = require('./movieUpsert.js')
const { chatResponse_schema } = require('../schema/ai.js')

const TMDB_TOKEN = process.env.TMDB_ACCESS_TOKEN
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY
const QWEN_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

async function tmdbFetch(endpoint, options = {}) {
  if (!TMDB_TOKEN) {
    throw new Error('缺少 TMDB_ACCESS_TOKEN')
  }
  const url = `${TMDB_BASE_URL}${endpoint}`
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!response.ok) {
    throw new Error(`TMDB ${endpoint} 请求失败: ${response.status}`)
  }
  return response.json()
}

async function fetchRecentMovies() {
  const currentYear = new Date().getFullYear()
  const data = await tmdbFetch('/movie/popular?language=zh-CN&page=1&region=CN')
  return data.results
    .filter((m) => {
      const year = m.release_date ? new Date(m.release_date).getFullYear() : 0
      return year >= currentYear - 3 && year <= currentYear
    })
    .slice(0, 20)
    .map(mapTmdbCandidate)
}

async function fetchClassicMovies() {
  const data = await tmdbFetch(
    '/discover/movie?language=zh-CN&sort_by=vote_average.desc&vote_count.gte=500&primary_release_date.gte=1980-01-01&primary_release_date.lte=2010-12-31&page=1'
  )
  return data.results.slice(0, 20).map(mapTmdbCandidate)
}

function mapTmdbCandidate(m) {
  return {
    id: m.id,
    title: m.title,
    year: m.release_date ? new Date(m.release_date).getFullYear() : '未知',
    overview: m.overview,
    vote_average: m.vote_average,
    poster_path: m.poster_path,
  }
}

function deduplicateById(items) {
  const seen = new Set()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function detectIntent(prompt) {
  const lower = prompt.toLowerCase()
  if (lower.includes('经典') || lower.includes('老片') || lower.includes('早期') || lower.includes('怀旧')) {
    return 'classic'
  }
  if (lower.includes('近期') || lower.includes('最新') || lower.includes('热播')) {
    return 'recent'
  }
  return 'mixed'
}

async function buildTasteProfile(username) {
  if (!username) return null

  const [favoriteRows] = await db.query(
    `SELECT m.genre, m.year, m.title
     FROM favorites f
     JOIN movies m ON m.id = f.movieId
     WHERE f.username = ?
     ORDER BY f.id DESC
     LIMIT 30`,
    [username]
  )

  const [reviewRows] = await db.query(
    `SELECT rating, content FROM reviews WHERE username = ? ORDER BY id DESC LIMIT 20`,
    [username]
  )

  if (!favoriteRows.length && !reviewRows.length) return null

  const genreCounter = new Map()
  favoriteRows.forEach((row) => {
    if (!row.genre) return
    String(row.genre)
      .split(/[\/,，\s]+/)
      .map((g) => g.trim())
      .filter(Boolean)
      .forEach((genre) => genreCounter.set(genre, (genreCounter.get(genre) || 0) + 1))
  })

  const topGenres = [...genreCounter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g)

  const years = favoriteRows.map((r) => Number(r.year)).filter((y) => Number.isFinite(y) && y > 1900)
  const positiveReviews = reviewRows.filter((r) => Number(r.rating) >= 8).length
  const avgReviewRating = reviewRows.length
    ? reviewRows.reduce((s, r) => s + Number(r.rating || 0), 0) / reviewRows.length
    : null

  const reviewKeywords = reviewRows
    .slice(0, 5)
    .map((r) => String(r.content || '').slice(0, 40))
    .filter(Boolean)

  return {
    username,
    topGenres,
    yearRange: years.length ? `${Math.min(...years)}-${Math.max(...years)}` : null,
    positiveReviews,
    avgReviewRating: avgReviewRating ? Number(avgReviewRating.toFixed(1)) : null,
    sampleFavorites: favoriteRows.slice(0, 5).map((r) => r.title).filter(Boolean),
    reviewKeywords,
  }
}

async function fetchCandidatesForIntent(intent) {
  if (intent === 'recent') return fetchRecentMovies()
  if (intent === 'classic') return fetchClassicMovies()
  const [recentResult, classicResult] = await Promise.allSettled([
    fetchRecentMovies(),
    fetchClassicMovies(),
  ])
  const all = []
  if (recentResult.status === 'fulfilled') all.push(...recentResult.value)
  if (classicResult.status === 'fulfilled') all.push(...classicResult.value)
  return deduplicateById(all).slice(0, 30)
}

function tasteProfileToText(tasteProfile) {
  if (!tasteProfile) return ''
  return (
    `\n\n用户口味档案（仅用于在候选池内排序倾向，不得推荐列表外电影）：` +
    `\n- 偏好类型：${tasteProfile.topGenres.join(' / ') || '暂无'}` +
    `\n- 常看年代：${tasteProfile.yearRange || '暂无'}` +
    `\n- 高分评论数：${tasteProfile.positiveReviews}` +
    `\n- 最近收藏：${tasteProfile.sampleFavorites.join('、') || '暂无'}` +
    `\n- 近期评论片段：${(tasteProfile.reviewKeywords || []).join('；') || '暂无'}`
  )
}

function matchesCandidate(movie, candidate) {
  return (
    candidate.title === movie.title ||
    (movie.tmdb_id && Number(candidate.id) === Number(movie.tmdb_id))
  )
}

function extractJSONObject(str) {
  const match = str.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

function extractJSONArray(str) {
  const match = str.match(/\[\s*\{[\s\S]*\}\s*\]/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

async function callQwenMessages(messages, temperature = 0.7) {
  if (!DASHSCOPE_API_KEY) {
    throw new Error('缺少 DASHSCOPE_API_KEY')
  }
  const response = await fetch(QWEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'qwen-turbo',
      messages,
      temperature,
      stream: false,
    }),
  })
  if (!response.ok) {
    throw new Error(`通义千问请求失败: ${response.status}`)
  }
  const data = await response.json()
  return data.choices[0]?.message?.content || ''
}

function enrichMoviesFromCandidates(recommendedMovies, movieCandidates, localIdByTmdb) {
  return recommendedMovies.map((movie) => {
    const tmdbMovie = movieCandidates.find((c) => matchesCandidate(movie, c))
    const tmdbId = tmdbMovie?.id || movie.tmdb_id || null
    const localMovieId = tmdbId ? localIdByTmdb.get(Number(tmdbId)) || null : null
    return {
      ...movie,
      id: tmdbId,
      tmdb_id: tmdbId,
      local_movie_id: localMovieId,
      poster_path: tmdbMovie?.poster_path || null,
      vote_average: tmdbMovie?.vote_average || null,
    }
  })
}

function buildMeta(movieCandidates, enrichedMovies, tasteProfile, toolsUsed) {
  const localMappedCount = enrichedMovies.filter((m) => m.local_movie_id).length
  return {
    candidateCount: movieCandidates.length,
    groundedCount: enrichedMovies.length,
    localMappedCount,
    localMappedRatePercent:
      enrichedMovies.length > 0
        ? Number(((localMappedCount / enrichedMovies.length) * 100).toFixed(1))
        : 0,
    profileApplied: Boolean(tasteProfile),
    tasteProfile: tasteProfile
      ? { topGenres: tasteProfile.topGenres, yearRange: tasteProfile.yearRange }
      : null,
    toolsUsed: toolsUsed || ['tasteProfile', 'tmdbCandidates', 'groundingFilter'],
  }
}

/** 单轮推荐（兼容 POST /recommend） */
async function runSingleTurnRecommend(prompt, tasteProfile) {
  const intent = detectIntent(prompt)
  let candidateFetchError = null
  let movieCandidates = []
  try {
    movieCandidates = await fetchCandidatesForIntent(intent)
  } catch (err) {
    candidateFetchError = err.message
  }
  if (movieCandidates.length === 0) {
    const err = new Error(candidateFetchError || '当前候选片库为空，请稍后重试或检查 TMDB 配置')
    err.status = 503
    throw err
  }

  const localIdByTmdb = await resolveLocalMovieIdsForCandidates(movieCandidates)
  const movieListText = movieCandidates
    .map((m) => `- 《${m.title}》（${m.year}年，TMDB ID: ${m.id}，评分: ${m.vote_average}）`)
    .join('\n')

  const systemPrompt =
    '你是一个电影推荐助手。' +
    `\n\n以下是从 TMDB 获取的真实电影列表：\n${movieListText}` +
    tasteProfileToText(tasteProfile) +
    '\n\n你必须只从上述列表中选择 3-5 部电影，严禁输出列表外片名。' +
    '返回 JSON 数组，每个对象包含 title、reason、year、tmdb_id。只返回 JSON 数组。'

  const aiContent = await callQwenMessages([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ])

  let recommendedMovies = extractJSONArray(aiContent) || []
  recommendedMovies = recommendedMovies.filter((movie) =>
    movieCandidates.some((c) => matchesCandidate(movie, c))
  )
  if (recommendedMovies.length === 0) {
    const err = new Error('未生成可信推荐结果，请尝试更具体的偏好描述')
    err.status = 422
    throw err
  }

  const enrichedMovies = enrichMoviesFromCandidates(recommendedMovies, movieCandidates, localIdByTmdb)
  return {
    movies: enrichedMovies,
    intent,
    meta: buildMeta(movieCandidates, enrichedMovies, tasteProfile),
  }
}

/** 多轮 chat：返回自然语言 + 结构化 movies */
async function runChatTurn({ message, tasteProfile, historyMessages }) {
  const intent = detectIntent(message)
  let movieCandidates = []
  try {
    movieCandidates = await fetchCandidatesForIntent(intent)
  } catch (err) {
    const e = new Error(err.message || '候选片库拉取失败')
    e.status = 503
    throw e
  }
  if (movieCandidates.length === 0) {
    const e = new Error('当前候选片库为空，请检查 TMDB 配置')
    e.status = 503
    throw e
  }

  const localIdByTmdb = await resolveLocalMovieIdsForCandidates(movieCandidates)
  const movieListText = movieCandidates
    .map((m) => `- 《${m.title}》（${m.year}年，TMDB ID: ${m.id}）`)
    .join('\n')

  const systemPrompt =
    '你是 MovieMate 受控推荐助手。你只能使用提供的候选电影列表作答。' +
    `\n候选列表：\n${movieListText}` +
    tasteProfileToText(tasteProfile) +
    '\n\n返回单个 JSON 对象（不要 markdown），格式：' +
    '{"reply":"给用户的中文回复","movies":[{"title":"","reason":"","year":2020,"tmdb_id":123}]}' +
    '\nmovies 必须从候选列表选 0-5 部，禁止列表外片名。'

  const convo = [{ role: 'system', content: systemPrompt }]
  ;(historyMessages || []).slice(-10).forEach((m) => {
    if (m.role === 'user' || m.role === 'assistant') {
      convo.push({ role: m.role, content: m.content })
    }
  })
  convo.push({ role: 'user', content: message })

  let parsed = null
  let raw = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    raw = await callQwenMessages(convo, attempt === 0 ? 0.7 : 0.3)
    parsed = extractJSONObject(raw)
    if (parsed) {
      const { error } = chatResponse_schema.validate(parsed)
      if (!error) break
    }
    parsed = null
  }

  if (!parsed) {
    const e = new Error('未生成可信对话结果，请换个说法重试')
    e.status = 422
    throw e
  }

  let movies = (parsed.movies || []).filter((movie) =>
    movieCandidates.some((c) => matchesCandidate(movie, c))
  )
  const enrichedMovies = enrichMoviesFromCandidates(movies, movieCandidates, localIdByTmdb)

  return {
    reply: parsed.reply,
    movies: enrichedMovies,
    meta: buildMeta(movieCandidates, enrichedMovies, tasteProfile, [
      'tool_readTasteProfile',
      'tool_fetchTmdbCandidates',
      'tool_groundAndMapLocal',
    ]),
  }
}

/** 本地片库画像推荐（左栏默认列表） */
async function getProfileFeedMovies(username, limit = 12) {
  const tasteProfile = await buildTasteProfile(username)
  let rows = []

  if (tasteProfile?.topGenres?.length) {
    const genre = tasteProfile.topGenres[0]
    const [result] = await db.query(
      `SELECT id, title, rating, poster, genre, year, summary
       FROM movies
       WHERE genre LIKE ?
       ORDER BY rating DESC, id ASC
       LIMIT ?`,
      [`%${genre}%`, limit]
    )
    rows = result
  }

  if (rows.length < limit) {
    const excludeIds = rows.map((r) => r.id)
    const placeholders = excludeIds.length ? excludeIds.map(() => '?').join(',') : '0'
    const sql =
      excludeIds.length > 0
        ? `SELECT id, title, rating, poster, genre, year, summary FROM movies WHERE id NOT IN (${placeholders}) ORDER BY rating DESC LIMIT ?`
        : `SELECT id, title, rating, poster, genre, year, summary FROM movies ORDER BY rating DESC LIMIT ?`
    const params = excludeIds.length ? [...excludeIds, limit - rows.length] : [limit - rows.length]
    const [more] = await db.query(sql, params)
    rows = [...rows, ...more]
  }

  return {
    movies: rows.map((m) => ({
      local_movie_id: m.id,
      title: m.title,
      year: m.year,
      rating: m.rating,
      poster: m.poster,
      genre: m.genre,
      reason: tasteProfile
        ? `匹配你的偏好类型：${tasteProfile.topGenres.join(' / ') || '综合高分'}`
        : '站内高分片单',
      summary: m.summary,
    })),
    tasteProfile: tasteProfile
      ? { topGenres: tasteProfile.topGenres, yearRange: tasteProfile.yearRange }
      : null,
  }
}

module.exports = {
  buildTasteProfile,
  runSingleTurnRecommend,
  runChatTurn,
  getProfileFeedMovies,
}
