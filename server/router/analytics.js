const express = require('express')
const router = express.Router()
const analyticsHandler = require('../router_handler/analytics.js')
const authMiddleware = require('../middleware/authMiddleware.js')

router.get('/analytics/overview', analyticsHandler.getOverview)
router.get('/analytics/genres', analyticsHandler.getGenres)
router.get('/analytics/year-trends', analyticsHandler.getYearTrends)
router.get('/analytics/top-popular', analyticsHandler.getTopPopular)
router.get('/analytics/forecast', analyticsHandler.getForecast)

router.get('/analytics/me/taste', authMiddleware, analyticsHandler.getMeTaste)
router.get('/analytics/me/ratings', authMiddleware, analyticsHandler.getMeRatings)
router.get('/analytics/me/activity', authMiddleware, analyticsHandler.getMeActivity)
router.get('/analytics/me/ai-usage', authMiddleware, analyticsHandler.getMeAiUsage)

module.exports = router
