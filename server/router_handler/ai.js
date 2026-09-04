const jwt = require('jsonwebtoken')
const { buildTasteProfile, runSingleTurnRecommend } = require('../utils/recommendCore.js')

function getUsernameFromRequest(req) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) return null
  try {
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET)
    return decoded?.username || null
  } catch {
    return null
  }
}

exports.getRecommendMovies = async (req, res) => {
  const { prompt } = req.body

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: { message: '请提供有效的电影偏好描述' } })
  }

  try {
    const username = getUsernameFromRequest(req)
    const tasteProfile = await buildTasteProfile(username)
    const { movies, intent, meta } = await runSingleTurnRecommend(prompt, tasteProfile)

    res.json({
      success: true,
      movies,
      intent,
      meta,
    })
  } catch (error) {
    console.error('AI 推荐错误:', error)
    const status = error.status || 500
    res.status(status).json({
      error: { message: error.message || 'AI 推荐失败，请稍后重试' },
    })
  }
}
