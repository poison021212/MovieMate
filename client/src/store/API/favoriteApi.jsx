import { createApi } from '@reduxjs/toolkit/query/react'
import { createBaseQueryWithReauth } from './baseQueryWithReauth'
import { API_BASE } from './apiBase'

const favoriteApi = createApi({
  reducerPath: 'favoriteApi',
  baseQuery: createBaseQueryWithReauth(API_BASE),
  endpoints: (builder) => ({
    getFavorite: builder.query({
      query: () => 'favorites',
      providesTags: ['Favorite'],
    }),
    addFavorite: builder.mutation({
      query: ({ movieId }) => ({
        url: 'favorites',
        method: 'POST',
        body: { movieId },
      }),
      invalidatesTags: ['Favorite'],
    }),
    delFavorite: builder.mutation({
      query: (id) => ({
        url: `favorites/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Favorite'],
    }),
  }),
});

export const {
  useGetFavoriteQuery,
  useAddFavoriteMutation,
  useDelFavoriteMutation,
} = favoriteApi;

export default favoriteApi;
