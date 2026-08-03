const express = require('express')
const router = express.Router()

// 导入用户路由处理函数
const userRouter = require('../router_handler/user.js')

// 注册用户路由
router.post('/auth/local/register', userRouter.register)

// 登录用户路由
router.post('/auth/local', userRouter.login)

module.exports = router