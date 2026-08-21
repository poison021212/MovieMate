/**
 * Turn RTK Query error into a user-facing message for list/detail pages.
 */
export function formatQueryError(error) {
  if (!error) return '请求失败'

  if (error.status === 'FETCH_ERROR') {
    const detail = error.error || 'Failed to fetch'
    return `网络错误：无法连接后端，请确认已运行 npm run dev 且 MySQL 已启动（${detail}）`
  }

  if (error.status === 'PARSING_ERROR') {
    return `响应解析失败（${error.error || 'invalid JSON'}）`
  }

  if (error.status === 'CUSTOM_ERROR') {
    const detail = error.error || error.data?.error?.message || error.data?.message
    return detail ? String(detail) : '请求失败'
  }

  if (typeof error.status === 'number') {
    const msg = error.data?.error?.message || error.data?.message
    return msg ? `HTTP ${error.status}：${msg}` : `HTTP ${error.status}`
  }

  const fallback = error.error || error.message || error.data?.error?.message
  return fallback ? String(fallback) : '请求失败'
}

export default formatQueryError
