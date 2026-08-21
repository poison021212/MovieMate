import { fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { loginSuccess, logout } from '@/store/Slice/authSlice'
import { API_BASE } from './apiBase'

const refreshBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE,
  credentials: 'include',
})

export function createBaseQueryWithReauth(baseUrl) {
  const rawBaseQuery = fetchBaseQuery({
    baseUrl,
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
      const token = getState().auth?.token
      if (token) headers.set('Authorization', `Bearer ${token}`)
      return headers
    },
  })

  return async function baseQueryWithReauth(args, api, extraOptions) {
    let result = await rawBaseQuery(args, api, extraOptions)

    if (result.error?.status === 401 && !extraOptions?.skipReauth) {
      const refreshResult = await refreshBaseQuery(
        {
          url: 'auth/refresh',
          method: 'POST',
          body: {},
        },
        api,
        { ...extraOptions, skipReauth: true }
      )
      if (refreshResult.data) {
        api.dispatch(
          loginSuccess({
            token: refreshResult.data.accessToken || refreshResult.data.jwt,
            userInfo: refreshResult.data.user,
            expiresIn: refreshResult.data.expiresIn,
          })
        )
        result = await rawBaseQuery(args, api, extraOptions)
      } else {
        api.dispatch(logout())
      }
    }

    return result
  }
}

export default createBaseQueryWithReauth(API_BASE)
