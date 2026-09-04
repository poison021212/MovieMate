/**
 * 每用户 AI 对话限流（进程内，Demo 级）
 */

const buckets = new Map()
const WINDOW_MS = 60 * 1000
const MAX_PER_WINDOW = 12

function checkAgentChatRateLimit(username) {
  const key = String(username || 'anon')
  const now = Date.now()
  let entry = buckets.get(key)
  if (!entry || now - entry.start > WINDOW_MS) {
    entry = { start: now, count: 0 }
    buckets.set(key, entry)
  }
  entry.count += 1
  if (entry.count > MAX_PER_WINDOW) {
    const err = new Error('请求过于频繁，请稍后再试')
    err.status = 429
    throw err
  }
}

module.exports = { checkAgentChatRateLimit }
