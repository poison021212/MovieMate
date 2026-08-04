const express = require('express')
const router = express.Router()

const ai_handler = require('../router_handler/ai.js')
const ai_chat = require('../router_handler/aiChat.js')
const optionalAuth = require('../middleware/optionalAuth.js')
const authMiddleware = require('../middleware/authMiddleware.js')

router.post('/recommend', ai_handler.getRecommendMovies)

router.get('/recommend/profile-feed', optionalAuth, ai_chat.getProfileFeed)

router.get('/recommend/sessions', authMiddleware, ai_chat.listSessions)
router.post('/recommend/sessions', authMiddleware, ai_chat.createSession)
router.delete('/recommend/sessions/:id', authMiddleware, ai_chat.deleteSession)
router.get('/recommend/sessions/:id/messages', authMiddleware, ai_chat.getSessionMessages)
router.post('/recommend/chat', authMiddleware, ai_chat.postRecommendChat)

module.exports = router
