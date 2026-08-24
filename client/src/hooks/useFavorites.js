import { useGetFavoriteQuery } from '@/store/API/favoriteApi'
import { useSelector } from 'react-redux'

// 收藏统一出口：favorites 已由后端按登录用户过滤，此处只负责解包与未登录跳过
export function useFavorites() {
  const auth = useSelector((state) => state.auth)
  const { data, ...rest } = useGetFavoriteQuery(undefined, { skip: !auth.isLogin })
  const favorites = Array.isArray(data?.data) ? data.data : []
  return { favorites, ...rest }
}