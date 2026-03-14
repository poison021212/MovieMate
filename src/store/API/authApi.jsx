import React from 'react'
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: fetchBaseQuery({ baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:1337/api' }),
  endpoints(builder) {
    return {
      register: builder.mutation({
        query(user) {
          return {
            url: 'auth/local/register',
            method: 'POST',
            body: user,
          }
        }
      }),
      login: builder.mutation({
        query(user) {
          return {
            url: 'auth/local/',
            method: 'POST',
            body: user,
          }
        }
      })
    }
  }
})

export default authApi
export const { useRegisterMutation, useLoginMutation } = authApi