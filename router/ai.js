const express = require('express')
const router = express.Router()

const ai_handler = require('../router_handler/ai.js')

// 确保路由路径和前端请求路径一致
router.post('/recommend', ai_handler.getRecommendMovies)
module.exports = router