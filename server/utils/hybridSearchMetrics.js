/**
 * Hybrid 搜索观测：进程内累计 + MySQL 事件持久化
 */

const db = require('../db/index.js')

const state = {
  hybridKeywordRequests: 0,
  localOnlyResponses: 0,
  localHasResults: 0,
  fallbackTriggered: 0,
  fallbackErrors: 0,
  tmdbFetchedTotal: 0,
  tmdbPersistedTotal: 0,
  sourceCounts: { local: 0, mixed: 0, tmdb: 0 },
  startedAt: new Date().toISOString(),
}

let persistEnabled = true

function pct(numerator, denominator) {
  if (!denominator) return 0
  return Number(((numerator / denominator) * 100).toFixed(1))
}

async function persistEvent(event) {
  if (!persistEnabled) return
  try {
    await db.query(
      `INSERT INTO hybrid_search_events
       (had_keyword, fallback_triggered, fallback_error, source, tmdb_fetched, tmdb_persisted, local_count_before)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        event.hadKeyword ? 1 : 0,
        event.fallbackTriggered ? 1 : 0,
        event.fallbackError ? 1 : 0,
        event.source || 'local',
        event.tmdbFetched || 0,
        event.tmdbPersisted || 0,
        event.localCountBeforeFallback ?? 0,
      ]
    )
  } catch {
    persistEnabled = false
  }
}

function recordHybridSearchEvent(event) {
  if (!event.hadKeyword) return

  state.hybridKeywordRequests += 1
  const sourceKey = event.source
  if (Object.prototype.hasOwnProperty.call(state.sourceCounts, sourceKey)) {
    state.sourceCounts[sourceKey] += 1
  }

  const localBefore = event.localCountBeforeFallback ?? 0
  if (localBefore > 0) state.localHasResults += 1

  if (event.fallbackTriggered) {
    state.fallbackTriggered += 1
    state.tmdbFetchedTotal += event.tmdbFetched || 0
    state.tmdbPersistedTotal += event.tmdbPersisted || 0
    if (event.fallbackError) state.fallbackErrors += 1
  } else {
    state.localOnlyResponses += 1
  }

  persistEvent(event).catch(() => {})
}

async function getHybridSearchMetricsFromDb() {
  try {
    const [rows] = await db.query(
      `SELECT
         COUNT(*) AS hybridKeywordRequests,
         SUM(CASE WHEN fallback_triggered = 0 THEN 1 ELSE 0 END) AS localOnlyResponses,
         SUM(CASE WHEN local_count_before > 0 THEN 1 ELSE 0 END) AS localHasResults,
         SUM(CASE WHEN fallback_triggered = 1 THEN 1 ELSE 0 END) AS fallbackTriggered,
         SUM(CASE WHEN fallback_error = 1 THEN 1 ELSE 0 END) AS fallbackErrors,
         SUM(tmdb_fetched) AS tmdbFetchedTotal,
         SUM(tmdb_persisted) AS tmdbPersistedTotal,
         SUM(CASE WHEN source = 'local' THEN 1 ELSE 0 END) AS sourceLocal,
         SUM(CASE WHEN source = 'mixed' THEN 1 ELSE 0 END) AS sourceMixed,
         SUM(CASE WHEN source = 'tmdb' THEN 1 ELSE 0 END) AS sourceTmdb
       FROM hybrid_search_events
       WHERE had_keyword = 1`
    )
    const r = rows[0] || {}
    const requests = Number(r.hybridKeywordRequests || 0)
    if (requests === 0) return null
    return {
      hybridKeywordRequests: requests,
      localOnlyResponses: Number(r.localOnlyResponses || 0),
      localHasResults: Number(r.localHasResults || 0),
      fallbackTriggered: Number(r.fallbackTriggered || 0),
      fallbackErrors: Number(r.fallbackErrors || 0),
      tmdbFetchedTotal: Number(r.tmdbFetchedTotal || 0),
      tmdbPersistedTotal: Number(r.tmdbPersistedTotal || 0),
      sourceCounts: {
        local: Number(r.sourceLocal || 0),
        mixed: Number(r.sourceMixed || 0),
        tmdb: Number(r.sourceTmdb || 0),
      },
      persisted: true,
      rates: {
        localOnlyRatePercent: pct(Number(r.localOnlyResponses || 0), requests),
        localHitRatePercent: pct(Number(r.localOnlyResponses || 0), requests),
        localHasResultsRatePercent: pct(Number(r.localHasResults || 0), requests),
        fallbackTriggerRatePercent: pct(Number(r.fallbackTriggered || 0), requests),
        persistEfficiencyPercent: pct(Number(r.tmdbPersistedTotal || 0), Number(r.tmdbFetchedTotal || 0)),
      },
    }
  } catch {
    return null
  }
}

function getHybridSearchMetricsSnapshot() {
  const requests = state.hybridKeywordRequests
  return {
    ...state,
    persisted: false,
    rates: {
      localOnlyRatePercent: pct(state.localOnlyResponses, requests),
      localHitRatePercent: pct(state.localOnlyResponses, requests),
      localHasResultsRatePercent: pct(state.localHasResults, requests),
      fallbackTriggerRatePercent: pct(state.fallbackTriggered, requests),
      persistEfficiencyPercent: pct(state.tmdbPersistedTotal, state.tmdbFetchedTotal),
    },
  }
}

async function getHybridSearchMetricsSnapshotAsync() {
  const fromDb = await getHybridSearchMetricsFromDb()
  if (fromDb) return fromDb
  return getHybridSearchMetricsSnapshot()
}

module.exports = {
  recordHybridSearchEvent,
  getHybridSearchMetricsSnapshot,
  getHybridSearchMetricsSnapshotAsync,
}
