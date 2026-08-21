const { hasLlm, chatCompletionsText } = require('./llmClient.js')

async function maybeSummarizeSession({ sessionId, messages, existingSummary }) {
  if (!hasLlm() || !sessionId) return existingSummary || null
  const turns = (messages || []).filter((m) => m.role === 'user' || m.role === 'assistant')
  if (turns.length < 8) return existingSummary || null

  const recent = turns.slice(-12).map((m) => `${m.role}: ${String(m.content).slice(0, 200)}`).join('\n')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const summary = await chatCompletionsText({
      messages: [
        {
          role: 'system',
          content:
            '将会话压缩为 120 字以内中文摘要，保留用户口味偏好与已推荐片名。只输出摘要正文。',
        },
        {
          role: 'user',
          content: `已有摘要：${existingSummary || '无'}\n\n最近对话：\n${recent}`,
        },
      ],
      temperature: 0.3,
      signal: controller.signal,
    })
    const trimmed = String(summary || '').trim().slice(0, 500)
    return trimmed || existingSummary || null
  } catch {
    return existingSummary || null
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { maybeSummarizeSession }
