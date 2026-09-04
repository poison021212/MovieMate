const db = require('../db/index.js')

function mapTmdbListItem(m) {
  const releaseDate = m.release_date || null
  return {
    tmdb_id: m.id ?? m.tmdb_id ?? null,
    title: m.title || m.original_title || '未知标题',
    rating: m.vote_average ?? m.rating ?? 0,
    poster: m.poster_path
      ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
      : m.poster || null,
    year: releaseDate ? String(releaseDate).slice(0, 4) : m.year || null,
    summary: m.overview || m.summary || null,
    release_date: releaseDate,
  }
}

async function getMovieTableColumns() {
  const [rows] = await db.query('SHOW COLUMNS FROM movies')
  return new Set(rows.map((item) => item.Field))
}

async function upsertMovieRecord(movie, columns) {
  if (!movie.title) return null
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
    rating: movie.rating,
    poster: movie.poster,
    year: movie.year,
    summary: movie.summary,
    release_date: movie.release_date,
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
    return existingId
  }

  const insertPayload = {}
  Object.keys(fieldMap).forEach((field) => {
    if (columns.has(field)) insertPayload[field] = fieldMap[field]
  })
  if (!insertPayload.title) return null

  const keys = Object.keys(insertPayload)
  const placeholders = keys.map(() => '?').join(', ')
  const [result] = await db.query(
    `INSERT INTO movies (${keys.join(', ')}) VALUES (${placeholders})`,
    keys.map((key) => insertPayload[key])
  )
  return result.insertId
}

async function resolveLocalMovieIdFromTmdbItem(rawItem, columns) {
  const cols = columns || (await getMovieTableColumns())
  const movie = mapTmdbListItem(rawItem)
  return upsertMovieRecord(movie, cols)
}

async function resolveLocalMovieIdsForCandidates(candidates) {
  const columns = await getMovieTableColumns()
  const byTmdbId = new Map()
  for (const c of candidates) {
    if (!c?.id) continue
    const localId = await resolveLocalMovieIdFromTmdbItem(
      {
        id: c.id,
        title: c.title,
        release_date: c.year && c.year !== '未知' ? `${c.year}-01-01` : null,
        vote_average: c.vote_average,
        poster_path: c.poster_path,
        overview: c.overview,
      },
      columns
    )
    if (localId) byTmdbId.set(Number(c.id), localId)
  }
  return byTmdbId
}

module.exports = {
  mapTmdbListItem,
  getMovieTableColumns,
  upsertMovieRecord,
  resolveLocalMovieIdFromTmdbItem,
  resolveLocalMovieIdsForCandidates,
}
