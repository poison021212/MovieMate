import { API_BASE } from '@/store/API/apiBase'

/**
 * SSE 流式 AI 对话
 * @param {{ sessionId?: number, message: string, token: string, onEvent: (event: string, data: unknown) => void }} opts
 */
export async function streamRecommendChat({ sessionId, message, token, onEvent }) {
  const res = await fetch(`${API_BASE}/recommend/chat/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(
      sessionId != null && sessionId !== '' ? { sessionId, message } : { message }
    ),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody?.error?.message || `流式请求失败 (${res.status})`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('浏览器不支持流式响应')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''

    for (const chunk of chunks) {
      if (!chunk.trim()) continue
      const lines = chunk.split('\n')
      let event = 'message'
      let dataLine = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7).trim()
        if (line.startsWith('data: ')) dataLine = line.slice(6)
      }
      if (dataLine) {
        onEvent(event, JSON.parse(dataLine))
      }
    }
  }
}
