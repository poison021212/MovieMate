const express = require('express')
const router = express.Router()
const authMiddleware = require('../middleware/authMiddleware.js')
const adminMiddleware = require('../middleware/adminMiddleware.js')
const adminHandler = require('../router_handler/admin.js')

router.use(authMiddleware, adminMiddleware)

router.get('/me', adminHandler.getAdminMe)
router.get('/users', adminHandler.listUsers)
router.patch('/users/:id/status', adminHandler.updateUserStatus)
router.get('/reviews', adminHandler.listReviews)
router.delete('/reviews/:id', adminHandler.deleteReview)
router.get('/audit', adminHandler.listAuditLog)

module.exports = router
