const express = require('express')
const router = express.Router()
// 导入电影路由处理函数
const movieRouter = require('../router_handler/movie.js')
// 挂载电影路由
router.get('/movies', movieRouter.getMovies)
router.get('/movies/:id', movieRouter.getMovieById)
// 导出路由模块
module.exports = router