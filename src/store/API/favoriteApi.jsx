import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const favoriteApi = createApi({
  reducerPath: 'favoriteApi',
  baseQuery: fetchBaseQuery({ baseUrl: 'http://localhost:1337/api/' }),
  // 配置请求头，添加 Authorization 字段，验证用户身份
  prepareHeaders: (headers, { getState }) => {
    // 从 Redux 状态获取 token
    if (getState) {
      const token = getState().auth.token;
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }
    return headers;
  },
  endpoints(builder) {
    return {
      getFavorite: builder.query({
        query: () => {
          return {
            url: 'favorites',
            method: 'GET'
          }
        },
        providesTags: ['Favorite']
      }),
      addFavorite: builder.mutation({
        query: ({ movieId, username }) => ({
          url: 'favorites',
          method: 'POST',
          body: { data: { movieId, username } }
        }),
        // 添加收藏后，使相关查询失效
        invalidatesTags: ['Favorite'],
      }),
      delFavorite: builder.mutation({
        query: (id) => ({
          url: `favorites/${id}`,
          method: 'DELETE'
        }),
        // 移除收藏后，使相关查询失效
        invalidatesTags: ['Favorite'],
      }),
      // 检查电影是否已收藏
      checkFavorite: builder.query({
        query: (movieId) => `favorites/check?movieId=${movieId}`,
      }),
    }
  }
})

export const {
  useGetFavoriteQuery,
  useAddFavoriteMutation,
  useDelFavoriteMutation,
  useCheckFavoriteQuery
} = favoriteApi

export default favoriteApi