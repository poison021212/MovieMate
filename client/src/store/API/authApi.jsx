import { createApi } from '@reduxjs/toolkit/query/react'
import baseQueryWithReauth from './baseQueryWithReauth'

const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: baseQueryWithReauth,
  endpoints(builder) {
    return {
      register: builder.mutation({
        query(user) {
          return {
            url: 'auth/local/register',
            method: 'POST',
            body: user,
          }
        },
      }),
      login: builder.mutation({
        query(user) {
          return {
            url: 'auth/local',
            method: 'POST',
            body: user,
          }
        },
      }),
      verifyEmail: builder.mutation({
        query(body) {
          return {
            url: 'auth/verify-email',
            method: 'POST',
            body,
          }
        },
      }),
      resendVerification: builder.mutation({
        query(body) {
          return {
            url: 'auth/resend-verification',
            method: 'POST',
            body,
          }
        },
      }),
      refreshToken: builder.mutation({
        query(body) {
          return {
            url: 'auth/refresh',
            method: 'POST',
            body,
          }
        },
      }),
      logout: builder.mutation({
        query(body) {
          return {
            url: 'auth/logout',
            method: 'POST',
            body: body || {},
          }
        },
      }),
      forgotPassword: builder.mutation({
        query(body) {
          return {
            url: 'auth/forgot-password',
            method: 'POST',
            body,
          }
        },
      }),
      resetPassword: builder.mutation({
        query(body) {
          return {
            url: 'auth/reset-password',
            method: 'POST',
            body,
          }
        },
      }),
    }
  },
})

export default authApi
export const {
  useRegisterMutation,
  useLoginMutation,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useRefreshTokenMutation,
  useLogoutMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
} = authApi
