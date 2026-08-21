import { createApi } from '@reduxjs/toolkit/query/react'
import createBaseQueryWithReauth from './baseQueryWithReauth'

const vercelApi = createApi({
  reducerPath: 'vercelApi',
  tagTypes: ['AiSessions', 'AiMessages', 'ProfileFeed'],
  baseQuery: createBaseQueryWithReauth(import.meta.env.VITE_API_URL || '/'),
  endpoints: (builder) => ({
    recommendMovies: builder.mutation({
      query: (prompt) => ({
        url: '/api/recommend',
        method: 'POST',
        body: { prompt },
      }),
      keepUnusedDataFor: 0,
    }),
    getProfileFeed: builder.query({
      query: () => '/api/recommend/profile-feed',
      providesTags: ['ProfileFeed'],
    }),
    listAiSessions: builder.query({
      query: () => '/api/recommend/sessions',
      providesTags: ['AiSessions'],
    }),
    createAiSession: builder.mutation({
      query: (body) => ({
        url: '/api/recommend/sessions',
        method: 'POST',
        body: body || {},
      }),
      invalidatesTags: ['AiSessions'],
    }),
    deleteAiSession: builder.mutation({
      query: (id) => ({
        url: `/api/recommend/sessions/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['AiSessions', 'AiMessages'],
    }),
    getAiSessionMessages: builder.query({
      query: (sessionId) => `/api/recommend/sessions/${sessionId}/messages`,
      providesTags: (_r, _e, id) => [{ type: 'AiMessages', id }],
    }),
    recommendChat: builder.mutation({
      query: ({ sessionId, message }) => ({
        url: '/api/recommend/chat',
        method: 'POST',
        body: { sessionId, message },
      }),
      invalidatesTags: (_r, _e, arg) => [
        'AiSessions',
        { type: 'AiMessages', id: arg.sessionId },
        'ProfileFeed',
      ],
    }),
  }),
})

export const {
  useRecommendMoviesMutation,
  useGetProfileFeedQuery,
  useListAiSessionsQuery,
  useCreateAiSessionMutation,
  useDeleteAiSessionMutation,
  useGetAiSessionMessagesQuery,
  useRecommendChatMutation,
} = vercelApi
export default vercelApi
