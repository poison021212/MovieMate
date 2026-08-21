import { createApi } from '@reduxjs/toolkit/query/react'
import { createBaseQueryWithReauth } from './baseQueryWithReauth'
import { API_BASE } from './apiBase'

const adminApi = createApi({
  reducerPath: 'adminApi',
  tagTypes: ['AdminUsers', 'AdminReviews', 'AdminAudit'],
  baseQuery: createBaseQueryWithReauth(API_BASE),
  endpoints: (builder) => ({
    getAdminMe: builder.query({
      query: () => 'admin/me',
    }),
    listAdminUsers: builder.query({
      query: () => 'admin/users',
      providesTags: ['AdminUsers'],
    }),
    updateUserStatus: builder.mutation({
      query: ({ id, status }) => ({
        url: `admin/users/${id}/status`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: ['AdminUsers', 'AdminAudit'],
    }),
    listAdminReviews: builder.query({
      query: () => 'admin/reviews',
      providesTags: ['AdminReviews'],
    }),
    deleteAdminReview: builder.mutation({
      query: (id) => ({
        url: `admin/reviews/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['AdminReviews', 'AdminAudit'],
    }),
    listAdminAudit: builder.query({
      query: () => 'admin/audit',
      providesTags: ['AdminAudit'],
    }),
  }),
})

export const {
  useGetAdminMeQuery,
  useListAdminUsersQuery,
  useUpdateUserStatusMutation,
  useListAdminReviewsQuery,
  useDeleteAdminReviewMutation,
  useListAdminAuditQuery,
} = adminApi
export default adminApi
