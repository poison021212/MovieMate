import { createApi } from '@reduxjs/toolkit/query/react'
import { createBaseQueryWithReauth } from './baseQueryWithReauth'
import { API_BASE } from './apiBase'

const analyticsApi = createApi({
  reducerPath: 'analyticsApi',
  baseQuery: createBaseQueryWithReauth(API_BASE),
  endpoints: (builder) => ({
    getOverview: builder.query({
      query: () => 'analytics/overview',
      transformResponse: (res) => res.data,
    }),
    getGenres: builder.query({
      query: () => 'analytics/genres',
      transformResponse: (res) => res.data,
    }),
    getYearTrends: builder.query({
      query: () => 'analytics/year-trends',
      transformResponse: (res) => res.data,
    }),
    getTopPopular: builder.query({
      query: (limit = 10) => `analytics/top-popular?limit=${limit}`,
      transformResponse: (res) => res.data,
    }),
    getForecast: builder.query({
      query: ({ genre = '', horizon = 3 } = {}) =>
        `analytics/forecast?horizon=${horizon}${genre ? `&genre=${encodeURIComponent(genre)}` : ''}`,
      transformResponse: (res) => res.data,
    }),
    getMeTaste: builder.query({
      query: () => 'analytics/me/taste',
      transformResponse: (res) => res.data,
    }),
    getMeRatings: builder.query({
      query: () => 'analytics/me/ratings',
      transformResponse: (res) => res.data,
    }),
    getMeActivity: builder.query({
      query: () => 'analytics/me/activity',
      transformResponse: (res) => res.data,
    }),
    getMeAiUsage: builder.query({
      query: () => 'analytics/me/ai-usage',
      transformResponse: (res) => res.data,
    }),
  }),
})

export const {
  useGetOverviewQuery,
  useGetGenresQuery,
  useGetYearTrendsQuery,
  useGetTopPopularQuery,
  useGetForecastQuery,
  useGetMeTasteQuery,
  useGetMeRatingsQuery,
  useGetMeActivityQuery,
  useGetMeAiUsageQuery,
} = analyticsApi

export default analyticsApi
