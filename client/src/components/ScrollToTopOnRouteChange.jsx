import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** 路由 pathname 变化时回顶；保留 hash 锚点（如详情页 #movie-review） */
export default function ScrollToTopOnRouteChange() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) return
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname, hash])

  return null
}
