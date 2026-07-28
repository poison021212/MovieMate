const express = require('express')
const router = express.Router()
const authMiddleware = require('../middleware/authMiddleware.js')
// 所有收藏接口都需要登录
router.use(authMiddleware)

const favorite_handler = require('../router_handler/favorite.js')

router.get('/favorites', favorite_handler.getFavorites)
router.post('/favorites', favorite_handler.addFavorite)
router.delete('/favorites/:id', favorite_handler.deleteFavorite)

module.exports = router