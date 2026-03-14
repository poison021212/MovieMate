import React from 'react'
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const reviewApi = createApi({
  reducerPath: 'reviewApi',
  baseQuery: fetchBaseQuery({ baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:1337/api' }),
  endpoints(builder) {
    return {
      addReview: builder.mutation({
        query(review) {
          return {
            url: 'reviews',
            method: 'POST',
            body: review,
          }
        }
      }),
      getReview: builder.query({
        query() {
          return {
            url: 'reviews',
            method: 'GET',
          }
        },
      }),
      getReviewById: builder.query({
        query(id) {
          return {
            url: `reviews/${id}`,
            method: 'GET',
          }
        }
      }),

      delReview: builder.mutation({
        query(id) {
          return {
            url: `reviews/${id}`,
            method: 'DELETE',
          }
        },
      }),
    }
  }
})

export default reviewApi
export const { useAddReviewMutation, useGetReviewQuery, useGetReviewByIdQuery, useGetReviewByMovieIdQuery, useDelReviewMutation, useUpReviewMutation } = reviewApi
