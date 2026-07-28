const express = require('express')
const router = express.Router()
const authMiddleware = require('../middleware/authMiddleware.js')

const review_handler = require('../router_handler/review.js')

// 公开路由
router.get('/reviews', review_handler.getReviews)
// 需要认证的路由
router.post('/reviews', authMiddleware, review_handler.addReviews)
router.delete('/reviews/:id', authMiddleware, review_handler.deleteReviews)

module.exports = router