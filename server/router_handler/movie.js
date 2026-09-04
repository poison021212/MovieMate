const db = require('../db/index.js')
const {
  recordHybridSearchEvent,
  getHybridSearchMetricsSnapshot,
} = require('../utils/hybridSearchMetrics.js')
const { hasTmdbToken, searchTmdbMovies } = require('../utils/tmdbClient.js')

const HYBRID_MIN_LOCAL_RESULTS = 5

function mapTmdbToLocalMovie(tmdbMovie) {
  const year = tmdbMovie.release_date ? String(tmdbMovie.release_date).slice(0, 4) : null
  return {
    tmdb_id: tmdbMovie.id ?? null,
    title: tmdbMovie.title || tmdbMovie.original_title || '未知标题',
    rating: tmdbMovie.vote_average ?? 0,
    poster: tmdbMovie.poster_path
      ? `https://image.tmdb.org/t/p/w500${tmdbMovie.poster_path}`
      : null,
    year,
    summary: tmdbMovie.overview || null,
  }
}

async function getMovieTableColumns() {
  const [rows] = await db.query('SHOW COLUMNS FROM movies')
  return new Set(rows.map((item) => item.Field))
}

async function persistTmdbMovies(tmdbMovies) {
  if (!tmdbMovies.length) return { count: 0, ids: [] }
  const columns = await getMovieTableColumns()
  const hasTmdbId = columns.has('tmdb_id')
  const ids = []

  for (const rawMovie of tmdbMovies) {
    const movie = mapTmdbToLocalMovie(rawMovie)
    if (!movie.title) continue

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

    if (existingId) {
      const clauses = []
      const params = []
      if (columns.has('rating')) {
        clauses.push('rating = ?')
        params.push(movie.rating)
      }
      if (columns.has('poster')) {
        clauses.push('poster = ?')
        params.push(movie.poster)
      }
      if (columns.has('summary')) {
        clauses.push('summary = ?')
        params.push(movie.summary)
      }
      if (columns.has('year')) {
        clauses.push('year = ?')
        params.push(movie.year)
      }
      if (hasTmdbId) {
        clauses.push('tmdb_id = ?')
        params.push(movie.tmdb_id)
      }
      if (clauses.length > 0) {
        await db.query(`UPDATE movies SET ${clauses.join(', ')} WHERE id = ?`, [...params, existingId])
      }
      ids.push(existingId)
      continue
    }

    const payload = {}
    const fallbackFields = {
      title: movie.title,
      rating: movie.rating,
      poster: movie.poster,
      year: movie.year,
      summary: movie.summary,
      tmdb_id: movie.tmdb_id,
    }
    Object.keys(fallbackFields).forEach((key) => {
      if (columns.has(key)) payload[key] = fallbackFields[key]
    })
    if (!payload.title) continue

    const keys = Object.keys(payload)
    const placeholders = keys.map(() => '?').join(', ')
    const [result] = await db.query(
      `INSERT INTO movies (${keys.join(', ')}) VALUES (${placeholders})`,
      keys.map((k) => payload[k])
    )
    ids.push(result.insertId)
  }

  return { count: ids.length, ids }
}

async function fetchMoviesByIds(ids) {
  if (!ids.length) return []
  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await db.query(`SELECT * FROM movies WHERE id IN (${placeholders})`, ids)
  const byId = new Map(rows.map((row) => [row.id, row]))
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((movie) => ({ ...movie, documentId: movie.id }))
}

function mergeMovieResults(localRows, tmdbRows, pageSize) {
  const seen = new Set()
  const merged = []
  for (const row of localRows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    merged.push(row)
  }
  for (const row of tmdbRows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    merged.push(row)
  }
  return merged.slice(0, pageSize)
}

function buildQueryContext(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1)
  const pageSize = Math.min(Math.max(parseInt(query.pageSize, 10) || 12, 1), 100)
  const q = (query.q || '').trim()
  const sortBy = (query.sortBy || 'id').trim()
  const sortOrder = (query.sortOrder || 'asc').toLowerCase()
  const minRatingRaw = query.minRating
  const minRating =
    minRatingRaw !== undefined && minRatingRaw !== '' ? Number(minRatingRaw) : null
  const year = (query.year || '').trim()
  const genre = (query.genre || '').trim()

  const allowedSortBy = ['id', 'rating', 'year', 'title', 'release_date', 'popularity', 'vote_count']
  const safeSortBy = allowedSortBy.includes(sortBy) ? sortBy : 'id'
  const safeSortOrder = sortOrder === 'desc' ? 'DESC' : 'ASC'

  const conditions = []
  const whereParams = []
  if (q) {
    conditions.push('(title LIKE ? OR director LIKE ? OR actors LIKE ?)')
    whereParams.push(`%${q}%`, `%${q}%`, `%${q}%`)
  }
  if (minRating !== null && !Number.isNaN(minRating)) {
    conditions.push('rating >= ?')
    whereParams.push(minRating)
  }
  if (year) {
    conditions.push('year = ?')
    whereParams.push(year)
  }
  if (genre) {
    conditions.push('genre = ?')
    whereParams.push(genre)
  }

  return {
    page,
    pageSize,
    q,
    safeSortBy,
    safeSortOrder,
    whereSql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    whereParams,
  }
}

async function queryMoviesPage(ctx) {
  const offset = (ctx.page - 1) * ctx.pageSize
  const countSql = `SELECT COUNT(*) AS total FROM movies ${ctx.whereSql}`
  const [countRows] = await db.query(countSql, ctx.whereParams)
  const total = countRows[0]?.total || 0
  const totalPages = total === 0 ? 0 : Math.ceil(total / ctx.pageSize)

  const listSql = `
    SELECT * FROM movies
    ${ctx.whereSql}
    ORDER BY ${ctx.safeSortBy} ${ctx.safeSortOrder}
    LIMIT ? OFFSET ?
  `
  const [rows] = await db.query(listSql, [...ctx.whereParams, ctx.pageSize, offset])
  const data = rows.map((movie) => ({ ...movie, documentId: movie.id }))

  return {
    data,
    pagination: {
      page: ctx.page,
      pageSize: ctx.pageSize,
      total,
      totalPages,
    },
  }
}

exports.getMovies = async (req, res) => {
  try {
    const queryCtx = buildQueryContext(req.query)
    const useHybrid = req.query.hybrid === '1'
    let pageResult = await queryMoviesPage(queryCtx)
    const localCountBeforeFallback = pageResult.data.length
    let source = 'local'
    let tmdbFetched = 0
    let tmdbPersisted = 0
    let fallbackTriggered = false
    let fallbackError = false
    let fallbackErrorReason = null

    if (
      useHybrid &&
      queryCtx.page === 1 &&
      queryCtx.q &&
      pageResult.data.length < Math.min(queryCtx.pageSize, HYBRID_MIN_LOCAL_RESULTS)
    ) {
      fallbackTriggered = true
      try {
        if (!hasTmdbToken()) {
          fallbackError = true
          fallbackErrorReason = 'missing_token'
        } else {
          const tmdbMovies = await searchTmdbMovies(queryCtx.q)
          tmdbFetched = tmdbMovies.length
          const { count, ids } = await persistTmdbMovies(tmdbMovies)
          tmdbPersisted = count
          if (ids.length > 0) {
            const tmdbRows = await fetchMoviesByIds(ids)
            const merged = mergeMovieResults(pageResult.data, tmdbRows, queryCtx.pageSize)
            const hasLocal = pageResult.data.length > 0
            const hasTmdb = tmdbRows.length > 0
            source = hasLocal && hasTmdb ? 'mixed' : hasLocal ? 'local' : hasTmdb ? 'tmdb' : 'local'
            const total = Math.max(pageResult.pagination.total, merged.length)
            pageResult = {
              data: merged,
              pagination: {
                page: queryCtx.page,
                pageSize: queryCtx.pageSize,
                total,
                totalPages: total === 0 ? 0 : Math.ceil(total / queryCtx.pageSize),
              },
            }
          }
        }
      } catch (tmdbErr) {
        fallbackError = true
        fallbackErrorReason = tmdbErr.code || 'network_error'
        console.error('hybrid fallback error:', tmdbErr.message || tmdbErr)
      }
    }

    if (useHybrid && queryCtx.q) {
      recordHybridSearchEvent({
        hadKeyword: true,
        fallbackTriggered,
        fallbackError,
        source,
        tmdbFetched,
        tmdbPersisted,
        localCountBeforeFallback,
      })
    }

    const metricsSnapshot = useHybrid ? getHybridSearchMetricsSnapshot() : undefined

    res.success(
      {
        message: '获取电影列表成功',
        data: pageResult.data,
        pagination: {
          page: pageResult.pagination.page,
          pageSize: pageResult.pagination.pageSize,
          total: pageResult.pagination.total,
          totalPages: pageResult.pagination.totalPages,
        },
        meta: {
          source,
          hybrid: useHybrid,
          fallbackTriggered,
          fallbackError,
          fallbackErrorReason,
          localCountBeforeFallback,
          tmdbFetched,
          tmdbPersisted,
          ...(metricsSnapshot ? { aggregate: metricsSnapshot.rates } : {}),
        },
      },
      200
    )
  } catch (err) {
    console.error('getMovies error:', err)
    res.cc('获取电影列表失败', 500)
  }
}

exports.getHybridSearchStats = async (req, res) => {
  try {
    res.success(
      {
        message: 'hybrid 搜索观测统计（进程内，重启清零）',
        data: getHybridSearchMetricsSnapshot(),
      },
      200
    )
  } catch (err) {
    console.error('getHybridSearchStats error:', err)
    res.cc('获取 hybrid 统计失败', 500)
  }
}

exports.getMovieById = async (req, res) => {
  const { id } = req.params
  if (!id || isNaN(id)) {
    return res.cc('电影id参数错误')
  }
  try {
    const sql = 'SELECT * FROM movies where id=?'
    const [result] = await db.query(sql, [id])
    res.success({ message: '获取电影详情成功', data: result[0] }, 200)
  } catch (err) {
    res.cc('获取电影详情失败', 500)
  }
}
