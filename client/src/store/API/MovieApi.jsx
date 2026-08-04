import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:1337/api'
const ORIGIN_BASE = API_BASE.replace('/api', '')
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500'

// 统一海报地址规范化
function normalizePoster(poster) {
  const fallback = '/no-image.png'
  const rawPoster =
    typeof poster === 'string'
      ? poster
      : poster?.url || poster?.data?.url || ''

  if (!rawPoster) return fallback
  if (rawPoster.startsWith('http')) return rawPoster
  if (rawPoster.startsWith('/uploads')) return `${ORIGIN_BASE}${rawPoster}`

  // TMDB path: /xxx.jpg 或 xxx.jpg
  if (
    rawPoster.endsWith('.jpg') ||
    rawPoster.endsWith('.png') ||
    rawPoster.endsWith('.jpeg') ||
    rawPoster.endsWith('.webp') ||
    rawPoster.startsWith('/')
  ) {
    const normalized = rawPoster.startsWith('/') ? rawPoster : `/${rawPoster}`
    return `${TMDB_IMG_BASE}${normalized}`
  }

  return fallback
}

const MovieApi = createApi({
  reducerPath: 'movieApi',
  baseQuery: fetchBaseQuery({ baseUrl: API_BASE }),
  endpoints: (builder) => ({
    getMovies: builder.query({
      query: ({
        page = 1,
        pageSize = 12,
        q = '',
        hybrid = false,
        sortBy = 'id',
        sortOrder = 'asc',
        minRating,
        year,
        genre,
      } = {}) => {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
          sortBy,
          sortOrder,
        })
        if (q) params.set('q', q)
        if (hybrid) params.set('hybrid', '1')
        if (minRating !== undefined && minRating !== '' && minRating !== null) {
          params.set('minRating', String(minRating))
        }
        if (year) params.set('year', year)
        if (genre) params.set('genre', genre)
        return `movies?${params.toString()}`
      },
      transformResponse(baseQueryReturnValue) {
        const items = (baseQueryReturnValue.data || []).map((movie) => ({
          ...movie,
          title: movie.title || '未知电影',
          rating: movie.rating || 0,
          poster: normalizePoster(movie.poster),
        }))

        return {
          items,
          pagination: baseQueryReturnValue.pagination || {
            page: 1,
            pageSize: items.length,
            total: items.length,
            totalPages: 1,
          },
          meta: baseQueryReturnValue.meta || {
            source: 'local',
            hybrid: false,
            fallbackTriggered: false,
            tmdbFetched: 0,
            tmdbPersisted: 0,
          },
        }
      },
    }),

    getMoviesById: builder.query({
      query: (id) => `movies/${id}`,
      transformResponse(baseQueryReturnValue) {
        const movie = baseQueryReturnValue.data || {}
        return {
          ...movie,
          title: movie.title || '未知电影',
          rating: movie.rating || 0,
          poster: normalizePoster(movie.poster),
        }
      },
    }),
  }),
})

export const { useGetMoviesQuery, useGetMoviesByIdQuery } = MovieApi
export default MovieApi