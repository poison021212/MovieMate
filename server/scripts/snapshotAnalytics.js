/**
 * 写入 analytics_snapshots（全库 + 各类型）
 * 用法: node server/scripts/snapshotAnalytics.js
 * 可选: node server/scripts/snapshotAnalytics.js --days 7  回填近 N 天（用当前聚合值，便于 Demo 有趋势）
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const db = require('../db')

async function getMovieColumns() {
  const [rows] = await db.query('SHOW COLUMNS FROM movies')
  return new Set(rows.map((r) => r.Field))
}

async function aggregateForGenre(genreFilter, columns) {
  const popExpr = columns.has('popularity') ? 'AVG(popularity)' : 'NULL'
  const params = []
  let where = '1=1'
  if (genreFilter) {
    where = 'genre = ?'
    params.push(genreFilter)
  }
  const [rows] = await db.query(
    `SELECT COUNT(*) AS movie_count,
            AVG(rating) AS avg_rating,
            ${popExpr} AS avg_popularity
     FROM movies WHERE ${where}`,
    params
  )
  const row = rows[0] || {}
  return {
    avg_popularity: row.avg_popularity != null ? Number(row.avg_popularity) : null,
    avg_rating: row.avg_rating != null ? Number(Number(row.avg_rating).toFixed(2)) : null,
    movie_count: Number(row.movie_count || 0),
  }
}

async function upsertSnapshot(dateStr, genre, stats) {
  await db.query(
    `INSERT INTO analytics_snapshots (snapshot_date, genre, avg_popularity, avg_rating, movie_count)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       avg_popularity = VALUES(avg_popularity),
       avg_rating = VALUES(avg_rating),
       movie_count = VALUES(movie_count)`,
    [dateStr, genre, stats.avg_popularity, stats.avg_rating, stats.movie_count]
  )
}

function parseDaysArg() {
  const idx = process.argv.indexOf('--days')
  if (idx === -1) return 1
  return Math.min(Math.max(Number(process.argv[idx + 1]) || 1, 1), 30)
}

async function main() {
  const columns = await getMovieColumns()
  const days = parseDaysArg()
  const [genreRows] = await db.query(
    `SELECT DISTINCT genre FROM movies WHERE genre IS NOT NULL AND genre <> ''`
  )
  const genres = genreRows.map((r) => r.genre)

  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date()
    d.setDate(d.getDate() - offset)
    const dateStr = d.toISOString().slice(0, 10)

    const allStats = await aggregateForGenre(null, columns)
    await upsertSnapshot(dateStr, null, allStats)

    for (const genre of genres) {
      const stats = await aggregateForGenre(genre, columns)
      await upsertSnapshot(dateStr, genre, stats)
    }
    console.log(`snapshot ok: ${dateStr} (all + ${genres.length} genres)`)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
