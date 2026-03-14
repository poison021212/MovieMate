import React from "react";
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const MovieApi = createApi({
  reducerPath: 'movieApi',
  baseQuery: fetchBaseQuery({ baseUrl: import.meta.env.VITE_API_URL.replace('/api', '') }),
  endpoints: (builder) => {
    return {
      getMovies: builder.query({
        query: () => 'movies?populate=*', // 添加 populate=* 来获取关联的媒体文件
        // transformResponse 用来转换响应数据的格式
        transformResponse(baseQueryReturnValue, meta, arg) {
          console.log('API Response:', baseQueryReturnValue);
          // 处理电影数据
          return baseQueryReturnValue.data.map(movie => {
            console.log('Movie Data:', movie);
            // 确保 movie 对象有必要的字段
            return {
              ...movie,
              title: movie.title || '未知电影',
              rating: movie.rating || 0,
              // 处理 poster 字段，支持不同的存储格式
              poster: movie.poster ?
                (typeof movie.poster === 'object' && movie.poster.url ?
                  `${baseURL}${movie.poster.url}` :
                  typeof movie.poster === 'object' && movie.poster.data ?
                    `${baseURL}${movie.poster.data.attributes.url}` :
                    `${baseURL}/api/upload/files/${movie.poster}`
                ) :
                'https://via.placeholder.com/300x400?text=No+Image'
            };
          });
        }
      }),
      getMoviesById: builder.query({
        query: (id) => `movies/${id}?populate=*`, // 添加 populate=* 来获取关联的媒体文件
        // transformResponse 用来转换响应数据的格式
        transformResponse(baseQueryReturnValue, meta, arg) {
          const movie = baseQueryReturnValue.data;
          console.log('Single Movie Data:', movie);
          // 确保 movie 对象有必要的字段
          return {
            ...movie,
            title: movie.title || '未知电影',
            rating: movie.rating || 0,
            // 处理 poster 字段，支持不同的存储格式
            poster: movie.poster ?
              (typeof movie.poster === 'object' && movie.poster.url ?
                `http://localhost:1337${movie.poster.url}` :
                typeof movie.poster === 'object' && movie.poster.data ?
                  `http://localhost:1337${movie.poster.data.attributes.url}` :
                  `http://localhost:1337/api/upload/files/${movie.poster}`
              ) :
              'https://via.placeholder.com/300x400?text=No+Image'
          };
        }
      }),
      // 添加获取上传文件的端点
      getUploadFile: builder.query({
        query: (id) => `upload/files/${id}`
      })
    }
  }
})

export const { useGetMoviesQuery, useGetMoviesByIdQuery, useGetUploadFileQuery } = MovieApi
export default MovieApi