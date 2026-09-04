import { createApi } from '@reduxjs/toolkit/query/react'
import { createBaseQueryWithReauth } from './baseQueryWithReauth'
import { API_BASE } from './apiBase'

const vercelApi = createApi({
  reducerPath: 'vercelApi',
  tagTypes: ['AiSessions', 'AiMessages', 'ProfileFeed'],
  baseQuery: createBaseQueryWithReauth(API_BASE),
  endpoints: (builder) => ({
    recommendMovies: builder.mutation({
      query: (prompt) => ({
        url: 'recommend',
        method: 'POST',
        body: { prompt },
      }),
      keepUnusedDataFor: 0,
    }),
    getProfileFeed: builder.query({
      query: () => 'recommend/profile-feed',
      providesTags: ['ProfileFeed'],
    }),
    listAiSessions: builder.query({
      query: () => 'recommend/sessions',
      providesTags: ['AiSessions'],
    }),
    createAiSession: builder.mutation({
      query: (body) => ({
        url: 'recommend/sessions',
        method: 'POST',
        body: body || {},
      }),
      invalidatesTags: ['AiSessions'],
    }),
    deleteAiSession: builder.mutation({
      query: (id) => ({
        url: `recommend/sessions/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['AiSessions', 'AiMessages'],
    }),
    getAiSessionMessages: builder.query({
      query: (sessionId) => `recommend/sessions/${sessionId}/messages`,
      providesTags: (_r, _e, id) => [{ type: 'AiMessages', id }],
    }),
    recommendChat: builder.mutation({
      query: ({ sessionId, message }) => ({
        url: 'recommend/chat',
        method: 'POST',
        body:
          sessionId != null && sessionId !== ''
            ? { sessionId, message }
            : { message },
      }),
      invalidatesTags: (_r, _e, arg) => [
        'AiSessions',
        { type: 'AiMessages', id: arg.sessionId },
        'ProfileFeed',
      ],
    }),
    submitRecommendFeedback: builder.mutation({
      query: (body) => ({
        url: 'recommend/feedback',
        method: 'POST',
        body,
      }),
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
  useSubmitRecommendFeedbackMutation,
} = vercelApi
export default vercelApi
