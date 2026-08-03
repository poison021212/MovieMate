import { useGetMoviesQuery } from '@/store/API/MovieApi'

/**
 * 统一从 getMovies 响应中取 items（transform 后为 { items, pagination }）
 */
export function useMovieItems(params = {}) {
  const { data, isLoading, isError, error, isFetching } = useGetMoviesQuery(params)
  return {
    items: data?.items ?? [],
    pagination: data?.pagination,
    isLoading,
    isError,
    error,
    isFetching,
  }
}

export default useMovieItems
