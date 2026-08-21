const express = require('express')
const router = express.Router()
const authHandler = require('../router_handler/auth.js')
const authMiddleware = require('../middleware/authMiddleware.js')

router.post('/auth/local/register', authHandler.register)
router.post('/auth/local', authHandler.login)
router.post('/auth/verify-email', authHandler.verifyEmail)
router.post('/auth/resend-verification', authHandler.resendVerification)
router.post('/auth/refresh', authHandler.refresh)
router.post('/auth/logout', authMiddleware, authHandler.logout)
router.post('/auth/forgot-password', authHandler.forgotPassword)
router.post('/auth/reset-password', authHandler.resetPassword)

module.exports = router
