import { createApi } from '@reduxjs/toolkit/query/react'
import baseQueryWithReauth from './baseQueryWithReauth'

const reviewApi = createApi({
  reducerPath: 'reviewApi',
  tagTypes: ['Review', 'Reply'],
  baseQuery: baseQueryWithReauth,
  endpoints(builder) {
    return {
      addReview: builder.mutation({
        query(review) {
          return {
            url: 'reviews',
            method: 'POST',
            body: review,
          }
        },
        invalidatesTags: ['Review'],
      }),
      getReview: builder.query({
        query(params) {
          return {
            url: 'reviews',
            method: 'GET',
            params, // 支持 ?movieId=&username= 服务端筛选
          }
        },
        providesTags: ['Review'],
      }),
      getReviewById: builder.query({
        query(id) {
          return {
            url: `reviews/${id}`,
            method: 'GET',
          }
        },
      }),
      delReview: builder.mutation({
        query(id) {
          return {
            url: `reviews/${id}`,
            method: 'DELETE',
          }
        },
        invalidatesTags: ['Review'],
      }),
      getReviewReplies: builder.query({
        query(reviewId) {
          return {
            url: `reviews/${reviewId}/replies`,
            method: 'GET',
          }
        },
        providesTags: (_r, _e, id) => [{ type: 'Reply', id }],
      }),
      addReviewReply: builder.mutation({
        query({ reviewId, content }) {
          return {
            url: `reviews/${reviewId}/replies`,
            method: 'POST',
            body: { content },
          }
        },
        invalidatesTags: (_r, _e, arg) => [{ type: 'Reply', id: arg.reviewId }],
      }),
      deleteReviewReply: builder.mutation({
        query(replyId) {
          return {
            url: `replies/${replyId}`,
            method: 'DELETE',
          }
        },
        invalidatesTags: ['Reply'],
      }),
    }
  },
})

export default reviewApi
export const {
  useAddReviewMutation,
  useGetReviewQuery,
  useGetReviewByIdQuery,
  useDelReviewMutation,
  useGetReviewRepliesQuery,
  useAddReviewReplyMutation,
  useDeleteReviewReplyMutation,
} = reviewApi
