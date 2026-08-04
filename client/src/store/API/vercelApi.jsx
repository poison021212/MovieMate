import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const vercelApi = createApi({
  reducerPath: 'vercelApi',
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_URL || '/',
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('token')
      if (token) headers.set('Authorization', `Bearer ${token}`)
      return headers
    },
  }),
  endpoints: (builder) => ({
    recommendMovies: builder.mutation({
      query: (prompt) => ({
        url: '/api/recommend',   // 必须与代理函数路径一致
        method: 'POST',
        body: { prompt },
      }),
      keepUnusedDataFor: 0,
    }),
  }),
})

export const { useRecommendMoviesMutation } = vercelApi
export default vercelApi
