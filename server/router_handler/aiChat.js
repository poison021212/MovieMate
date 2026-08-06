const jwt = require('jsonwebtoken')
const { chat_schema, create_session_schema } = require('../schema/ai.js')
const sessionStore = require('../utils/aiSessionStore.js')
const { buildTasteProfile, runChatTurn, getProfileFeedMovies } = require('../utils/recommendCore.js')

function getUsernameFromRequest(req) {
  return req.user?.username || null
}

exports.getProfileFeed = async (req, res) => {
  try {
    const username = getUsernameFromRequest(req)
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
  let sessionId = req.body.sessionId ? Number(req.body.sessionId) : null
  const username = req.user.username

  const titleFromMessage = (text) => text.slice(0, 24) + (text.length > 24 ? '…' : '')

  try {
    let sessionRecord = null
    if (sessionId) {
      sessionRecord = await sessionStore.getSessionForUser(username, sessionId)
      if (!sessionRecord) return res.cc('会话不存在', 404)
    } else {
      sessionId = await sessionStore.createSession(username, titleFromMessage(message))
      sessionRecord = { title: titleFromMessage(message) }
    }

    const history = await sessionStore.listMessages(sessionId)
    const tasteProfile = await buildTasteProfile(username)

    await sessionStore.appendMessage(sessionId, 'user', message, null, null)

    const result = await runChatTurn({
      message,
      tasteProfile,
      historyMessages: history,
    })

    await sessionStore.appendMessage(
      sessionId,
      'assistant',
      result.reply,
      result.movies,
      result.meta
    )
    const shouldRenameDefaultSession =
      sessionRecord?.title === '新会话' && history.length === 0
    await sessionStore.touchSession(
      sessionId,
      shouldRenameDefaultSession ? titleFromMessage(message) : null
    )

    res.json({
      success: true,
      sessionId,
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

exports.getUsernameFromRequest = getUsernameFromRequest
