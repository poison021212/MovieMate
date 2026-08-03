import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const favoriteApi = createApi({
  reducerPath: 'favoriteApi',
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:1337/api',
    prepareHeaders: (headers, { getState }) => {
      const token = getState().auth.token;
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  endpoints: (builder) => ({
    getFavorite: builder.query({
      query: () => 'favorites',
      providesTags: ['Favorite'],
    }),
    addFavorite: builder.mutation({
      query: ({ movieId, username }) => ({
        url: 'favorites',
        method: 'POST',
        body: { data: { movieId, username } },
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
