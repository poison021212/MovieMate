/**
 * 进程内 hybrid 搜索观测（Demo 级，重启清零）
 */

const state = {
  hybridKeywordRequests: 0,
  localOnlyResponses: 0,
  localHasResults: 0,
  fallbackTriggered: 0,
  fallbackErrors: 0,
  tmdbFetchedTotal: 0,
  tmdbPersistedTotal: 0,
  sourceCounts: {
    local: 0,
    mixed: 0,
    tmdb: 0,
  },
  startedAt: new Date().toISOString(),
}

function pct(numerator, denominator) {
  if (!denominator) return 0
  return Number(((numerator / denominator) * 100).toFixed(1))
}

/**
 * @param {{ hadKeyword: boolean, fallbackTriggered: boolean, fallbackError?: boolean, source: string, tmdbFetched: number, tmdbPersisted: number, localCountBeforeFallback?: number }} event
 */
function recordHybridSearchEvent(event) {
  if (!event.hadKeyword) return

  state.hybridKeywordRequests += 1
  const sourceKey = event.source
  if (Object.prototype.hasOwnProperty.call(state.sourceCounts, sourceKey)) {
    state.sourceCounts[sourceKey] += 1
  }

  const localBefore = event.localCountBeforeFallback ?? 0
  if (localBefore > 0) {
    state.localHasResults += 1
  }

  if (event.fallbackTriggered) {
    state.fallbackTriggered += 1
    state.tmdbFetchedTotal += event.tmdbFetched || 0
    state.tmdbPersistedTotal += event.tmdbPersisted || 0
    if (event.fallbackError) state.fallbackErrors += 1
  } else {
    state.localOnlyResponses += 1
  }
}

function getHybridSearchMetricsSnapshot() {
  const requests = state.hybridKeywordRequests
  return {
    ...state,
    rates: {
      /** 未触发 TMDB 回退的请求占比（本地结果数已达阈值） */
      localOnlyRatePercent: pct(state.localOnlyResponses, requests),
      /** @deprecated 与 localOnlyRatePercent 同义，保留兼容 */
      localHitRatePercent: pct(state.localOnlyResponses, requests),
      /** 回退前本地至少命中 1 条的请求占比 */
      localHasResultsRatePercent: pct(state.localHasResults, requests),
      fallbackTriggerRatePercent: pct(state.fallbackTriggered, requests),
      persistEfficiencyPercent: pct(state.tmdbPersistedTotal, state.tmdbFetchedTotal),
    },
  }
}

module.exports = {
  recordHybridSearchEvent,
  getHybridSearchMetricsSnapshot,
}
