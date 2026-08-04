const express = require('express')
const router = express.Router()
const authMiddleware = require('../middleware/authMiddleware.js')

const review_handler = require('../router_handler/review.js')

router.get('/reviews', review_handler.getReviews)
router.post('/reviews', authMiddleware, review_handler.addReviews)
router.delete('/reviews/:id', authMiddleware, review_handler.deleteReviews)

router.get('/reviews/:id/replies', review_handler.getReviewReplies)
router.post('/reviews/:id/replies', authMiddleware, review_handler.addReviewReply)
router.delete('/replies/:replyId', authMiddleware, review_handler.deleteReply)

module.exports = router
