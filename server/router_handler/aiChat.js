const { chat_schema, create_session_schema } = require('../schema/ai.js')
const sessionStore = require('../utils/aiSessionStore.js')
const { buildTasteProfile } = require('../utils/recommendCore.js')
const {
  runAgentChatTurn,
  runAgentChatTurnCore,
} = require('../utils/agentRuntime.js')
const { checkAgentChatRateLimit } = require('../utils/agentChatRateLimit.js')
const { maybeSummarizeSession } = require('../utils/sessionSummary.js')

function getUsernameFromRequest(req) {
  return req.user?.username || null
}

function titleFromMessage(text) {
  return text.slice(0, 24) + (text.length > 24 ? '…' : '')
}

async function resolveChatSession(username, sessionId, message) {
  let sid = sessionId ? Number(sessionId) : null
  let sessionRecord = null
  if (sid) {
    sessionRecord = await sessionStore.getSessionForUser(username, sid)
    if (!sessionRecord) {
      sid = await sessionStore.createSession(username, titleFromMessage(message))
      sessionRecord = { title: titleFromMessage(message), summary: null }
    }
  } else {
    sid = await sessionStore.createSession(username, titleFromMessage(message))
    sessionRecord = { title: titleFromMessage(message), summary: null }
  }
  return { sessionId: sid, sessionRecord }
}

async function finalizeChatTurn({
  username,
  sessionId,
  sessionRecord,
  message,
  result,
  history,
}) {
  await sessionStore.appendMessage(sessionId, 'user', message, null, null)
  await sessionStore.appendMessage(sessionId, 'assistant', result.reply, result.movies, result.meta)

  const shouldRenameDefaultSession =
    sessionRecord?.title === '新会话' && history.length === 0
  await sessionStore.touchSession(
    sessionId,
    shouldRenameDefaultSession ? titleFromMessage(message) : null
  )

  const allMessages = [
    ...history,
    { role: 'user', content: message },
    { role: 'assistant', content: result.reply },
  ]
  const summary = await maybeSummarizeSession({
    sessionId,
    messages: allMessages,
    existingSummary: sessionRecord?.summary,
  })
  if (summary && summary !== sessionRecord?.summary) {
    await sessionStore.updateSessionSummary(sessionId, summary)
  }

  return { sessionId, summary }
}

exports.getProfileFeed = async (req, res) => {
  try {
    const username = getUsernameFromRequest(req)
    const { getProfileFeedMovies } = require('../utils/recommendCore.js')
    const feed = await getProfileFeedMovies(username, 12)
    res.json({ success: true, ...feed })
  } catch (err) {
    console.error('profile-feed', err)
    res.status(500).json({ error: { message: '加载画像推荐失败' } })
  }
}

exports.listSessions = async (req, res) => {
  try {
    const username = req.user.username
    const sessions = await sessionStore.listSessions(username)
    res.json({ success: true, sessions })
  } catch (err) {
    res.status(500).json({ error: { message: '获取会话列表失败' } })
  }
}

exports.createSession = async (req, res) => {
  const { error } = create_session_schema.validate(req.body || {})
  if (error) return res.cc(error.details[0].message, 400)
  try {
    const id = await sessionStore.createSession(req.user.username, req.body?.title)
    res.status(201).json({ success: true, sessionId: id })
  } catch (err) {
    res.status(500).json({ error: { message: '创建会话失败' } })
  }
}

exports.deleteSession = async (req, res) => {
  const sessionId = Number(req.params.id)
  if (!sessionId) return res.cc('会话 id 无效', 400)
  try {
    const ok = await sessionStore.deleteSession(req.user.username, sessionId)
    if (!ok) return res.cc('会话不存在或无权删除', 404)
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: { message: '删除会话失败' } })
  }
}

exports.getSessionMessages = async (req, res) => {
  const sessionId = Number(req.params.id)
  if (!sessionId) return res.cc('会话 id 无效', 400)
  try {
    const session = await sessionStore.getSessionForUser(req.user.username, sessionId)
    if (!session) return res.cc('会话不存在', 404)
    const messages = await sessionStore.listMessages(sessionId)
    res.json({ success: true, session, messages })
  } catch (err) {
    res.status(500).json({ error: { message: '获取消息失败' } })
  }
}

exports.postRecommendChat = async (req, res) => {
  const { error } = chat_schema.validate(req.body || {})
  if (error) return res.cc(error.details[0].message, 400)

  const { message } = req.body
  const username = req.user.username

  try {
    checkAgentChatRateLimit(username)
    const { sessionId, sessionRecord } = await resolveChatSession(
      username,
      req.body.sessionId ? Number(req.body.sessionId) : null,
      message
    )
    const history = await sessionStore.listMessages(sessionId)
    const tasteProfile = await buildTasteProfile(username)

    const result = await runAgentChatTurn({
      message,
      tasteProfile,
      historyMessages: history,
      username,
      sessionSummary: sessionRecord?.summary,
    })

    const finalized = await finalizeChatTurn({
      username,
      sessionId,
      sessionRecord,
      message,
      result,
      history,
    })

    res.json({
      success: true,
      sessionId: finalized.sessionId,
      assistantMessage: result.reply,
      movies: result.movies,
      meta: result.meta,
    })
  } catch (err) {
    console.error('recommend/chat', err)
    const status = err.status || 500
    res.status(status).json({
      error: { message: err.message || '对话推荐失败' },
    })
  }
}

exports.postRecommendChatStream = async (req, res) => {
  const { error } = chat_schema.validate(req.body || {})
  if (error) return res.cc(error.details[0].message, 400)

  const { message } = req.body
  const username = req.user.username

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  try {
    checkAgentChatRateLimit(username)
    const { sessionId, sessionRecord } = await resolveChatSession(
      username,
      req.body.sessionId ? Number(req.body.sessionId) : null,
      message
    )
    sendEvent('session', { sessionId })

    const history = await sessionStore.listMessages(sessionId)
    const tasteProfile = await buildTasteProfile(username)

    const result = await runAgentChatTurnCore({
      message,
      tasteProfile,
      historyMessages: history,
      username,
      sessionSummary: sessionRecord?.summary,
      onEvent: (ev) => {
        if (ev.type === 'plan') sendEvent('plan', { steps: ev.steps })
        if (ev.type === 'trace') sendEvent('trace', { entry: ev.entry })
        if (ev.type === 'error') sendEvent('error', { message: ev.message })
        if (ev.type === 'token' && ev.text) sendEvent('token', { text: ev.text })
      },
    })

    const finalized = await finalizeChatTurn({
      username,
      sessionId,
      sessionRecord,
      message,
      result,
      history,
    })

    sendEvent('done', {
      sessionId: finalized.sessionId,
      assistantMessage: result.reply,
      movies: result.movies,
      meta: result.meta,
    })
    res.end()
  } catch (err) {
    console.error('recommend/chat/stream', err)
    sendEvent('error', { message: err.message || '流式对话失败' })
    res.end()
  }
}

exports.getUsernameFromRequest = getUsernameFromRequest
