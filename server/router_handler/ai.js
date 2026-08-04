// controllers/aiController.js
const jwt = require('jsonwebtoken')
const db = require('../db/index.js')
const { resolveLocalMovieIdsForCandidates } = require('../utils/movieUpsert.js')

const TMDB_TOKEN = process.env.TMDB_ACCESS_TOKEN
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY
const QWEN_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

async function tmdbFetch(endpoint, options = {}) {
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
    .map((m) => ({
      id: m.id,
      title: m.title,
      year: m.release_date ? new Date(m.release_date).getFullYear() : '未知',
      overview: m.overview,
      vote_average: m.vote_average,
      poster_path: m.poster_path,
    }))
}

async function fetchClassicMovies() {
  const data = await tmdbFetch(
    '/discover/movie?language=zh-CN&sort_by=vote_average.desc&vote_count.gte=500&primary_release_date.gte=1980-01-01&primary_release_date.lte=2010-12-31&page=1'
  )
  return data.results.slice(0, 20).map((m) => ({
    id: m.id,
    title: m.title,
    year: m.release_date ? new Date(m.release_date).getFullYear() : '未知',
    overview: m.overview,
    vote_average: m.vote_average,
    poster_path: m.poster_path,
  }))
}

function deduplicateById(items) {
  const seen = new Set()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function extractJSONArray(str) {
  const match = str.match(/\[\s*\{[\s\S]*\}\s*\]/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch (e) {
    console.error('JSON 解析失败:', match[0])
    return null
  }
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

function getUsernameFromRequest(req) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) return null
  try {
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET)
    return decoded?.username || null
  } catch {
    return null
  }
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

  return {
    username,
    topGenres,
    yearRange: years.length ? `${Math.min(...years)}-${Math.max(...years)}` : null,
    positiveReviews,
    avgReviewRating: avgReviewRating ? Number(avgReviewRating.toFixed(1)) : null,
    sampleFavorites: favoriteRows.slice(0, 5).map((r) => r.title).filter(Boolean),
  }
}

async function callQwen(systemPrompt, userPrompt) {
  const response = await fetch(QWEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'qwen-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      stream: false,
    }),
  })

  if (!response.ok) {
    throw new Error(`通义千问请求失败: ${response.status}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || ''
}

function matchesCandidate(movie, candidate) {
  return (
    candidate.title === movie.title ||
    (movie.tmdb_id && Number(candidate.id) === Number(movie.tmdb_id))
  )
}

exports.getRecommendMovies = async (req, res) => {
  const { prompt } = req.body

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: { message: '请提供有效的电影偏好描述' } })
  }

  try {
    const intent = detectIntent(prompt)
    const username = getUsernameFromRequest(req)
    const tasteProfile = await buildTasteProfile(username)

    let movieCandidates = []
    let candidateFetchError = null
    try {
      if (intent === 'recent') {
        movieCandidates = await fetchRecentMovies()
      } else if (intent === 'classic') {
        movieCandidates = await fetchClassicMovies()
      } else {
        const [recentResult, classicResult] = await Promise.allSettled([
          fetchRecentMovies(),
          fetchClassicMovies(),
        ])
        const all = []
        if (recentResult.status === 'fulfilled') all.push(...recentResult.value)
        if (classicResult.status === 'fulfilled') all.push(...classicResult.value)
        movieCandidates = deduplicateById(all).slice(0, 30)
      }
    } catch (err) {
      candidateFetchError = err.message
      console.error('TMDB 获取失败:', err)
    }

    if (movieCandidates.length === 0) {
      return res.status(503).json({
        error: {
          message: candidateFetchError || '当前候选片库为空，请稍后重试或检查 TMDB 配置',
        },
      })
    }

    const localIdByTmdb = await resolveLocalMovieIdsForCandidates(movieCandidates)

    const movieListText = movieCandidates
      .map((m) => `- 《${m.title}》（${m.year}年，TMDB ID: ${m.id}，评分: ${m.vote_average}）`)
      .join('\n')

    const tasteText = tasteProfile
      ? `\n\n用户口味档案（仅用于在候选池内排序倾向，不得推荐列表外电影）：` +
        `\n- 偏好类型：${tasteProfile.topGenres.join(' / ') || '暂无'}` +
        `\n- 常看年代：${tasteProfile.yearRange || '暂无'}` +
        `\n- 高分评论数：${tasteProfile.positiveReviews}` +
        `\n- 最近收藏：${tasteProfile.sampleFavorites.join('、') || '暂无'}`
      : ''

    const systemPrompt =
      '你是一个电影推荐助手。' +
      `\n\n以下是从 TMDB 获取的真实电影列表：\n${movieListText}` +
      tasteText +
      '\n\n你必须只从上述列表中选择 3-5 部电影，严禁输出列表外片名。' +
      '返回 JSON 数组，每个对象包含 title、reason、year、tmdb_id。只返回 JSON 数组。'

    const aiContent = await callQwen(systemPrompt, prompt)
    let recommendedMovies = extractJSONArray(aiContent) || []

    recommendedMovies = recommendedMovies.filter((movie) =>
      movieCandidates.some((c) => matchesCandidate(movie, c))
    )

    if (recommendedMovies.length === 0) {
      return res.status(422).json({
        error: { message: '未生成可信推荐结果，请尝试更具体的偏好描述' },
      })
    }

    const enrichedMovies = recommendedMovies.map((movie) => {
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

    const localMappedCount = enrichedMovies.filter((m) => m.local_movie_id).length

    res.json({
      success: true,
      movies: enrichedMovies,
      intent,
      meta: {
        candidateCount: movieCandidates.length,
        groundedCount: enrichedMovies.length,
        localMappedCount,
        localMappedRatePercent:
          enrichedMovies.length > 0
            ? Number(((localMappedCount / enrichedMovies.length) * 100).toFixed(1))
            : 0,
        profileApplied: Boolean(tasteProfile),
        tasteProfile: tasteProfile
          ? {
              topGenres: tasteProfile.topGenres,
              yearRange: tasteProfile.yearRange,
            }
          : null,
      },
    })
  } catch (error) {
    console.error('AI 推荐错误:', error)
    res.status(500).json({ error: { message: error.message || 'AI 推荐失败，请稍后重试' } })
  }
}
