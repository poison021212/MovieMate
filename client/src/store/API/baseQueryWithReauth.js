import { fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { loginSuccess, logout } from '@/store/Slice/authSlice'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:1337/api'

const refreshBaseQuery = fetchBaseQuery({ baseUrl: API_BASE })

export function createBaseQueryWithReauth(baseUrl) {
  const rawBaseQuery = fetchBaseQuery({
    baseUrl,
    prepareHeaders: (headers, { getState }) => {
      const token = getState().auth?.token || localStorage.getItem('token')
      if (token) headers.set('Authorization', `Bearer ${token}`)
      return headers
    },
  })

  return async function baseQueryWithReauth(args, api, extraOptions) {
    let result = await rawBaseQuery(args, api, extraOptions)

    if (result.error?.status === 401 && !extraOptions?.skipReauth) {
      const refreshToken =
        api.getState().auth?.refreshToken || localStorage.getItem('refreshToken')
      if (refreshToken) {
        const refreshResult = await refreshBaseQuery(
          {
            url: 'auth/refresh',
            method: 'POST',
            body: { refreshToken },
          },
          api,
          extraOptions
        )
        if (refreshResult.data) {
          api.dispatch(
            loginSuccess({
              token: refreshResult.data.accessToken || refreshResult.data.jwt,
              refreshToken: refreshResult.data.refreshToken,
              userInfo: refreshResult.data.user,
              expiresIn: refreshResult.data.expiresIn,
            })
          )
          result = await rawBaseQuery(args, api, extraOptions)
        } else {
          api.dispatch(logout())
        }
      } else {
        api.dispatch(logout())
      }
    }

    return result
  }
}

export default createBaseQueryWithReauth(API_BASE)
