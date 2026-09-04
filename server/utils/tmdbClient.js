const TMDB_TOKEN = process.env.TMDB_ACCESS_TOKEN
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || ''
const TMDB_FALLBACK_MAX_FETCH = 20

let tmdbHttpFetch = fetch

if (PROXY_URL) {
  const { ProxyAgent, fetch: undiciFetch } = require('undici')
  const proxyAgent = new ProxyAgent(PROXY_URL)
  tmdbHttpFetch = (url, init) => undiciFetch(url, { ...init, dispatcher: proxyAgent })
}

function hasTmdbToken() {
  return Boolean(TMDB_TOKEN)
}

async function tmdbFetchJson(pathOrUrl, options = {}) {
  if (!TMDB_TOKEN) {
    const err = new Error('缺少 TMDB_ACCESS_TOKEN')
    err.code = 'TMDB_NO_TOKEN'
    throw err
  }

  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${TMDB_BASE_URL}${pathOrUrl}`
  const resp = await tmdbHttpFetch(url, {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    ...options,
  })

  if (!resp.ok) {
    const err = new Error(`TMDB 请求失败: ${resp.status}`)
    err.code = 'TMDB_HTTP_ERROR'
    err.status = resp.status
    throw err
  }

  return resp.json()
}

async function searchTmdbMovies(query, { language = 'zh-CN', region = 'CN', page = 1 } = {}) {
  if (!query) return []
  const endpoint = `/search/movie?query=${encodeURIComponent(
    query
  )}&language=${encodeURIComponent(language)}&region=${encodeURIComponent(
    region
  )}&page=${page}&include_adult=false`
  const data = await tmdbFetchJson(endpoint)
  return Array.isArray(data.results) ? data.results.slice(0, TMDB_FALLBACK_MAX_FETCH) : []
}

module.exports = {
  hasTmdbToken,
  tmdbFetchJson,
  searchTmdbMovies,
  TMDB_FALLBACK_MAX_FETCH,
}
