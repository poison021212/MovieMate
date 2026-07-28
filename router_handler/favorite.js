const db = require('../db/index.js')
const { addFavorite_schema } = require('../schema/favorite.js')

// 获取收藏列表
// GET /api/favorites
exports.getFavorites = async (req, res) => {
  const username = req.user.username//从token中获取用户名
  try {
    const sql = 'select * from favorites where username=? order by id'
    const [result] = await db.query(sql, [username])
    const data = result.map(fav => ({
      ...fav, documentId: fav.id
    }))
    res.success({ data })
  } catch (err) {
    res.cc('获取收藏失败!', 500)
  }
}

// 添加收藏
// POST /api/favorites
exports.addFavorite = async (req, res) => {
  const { data } = req.body
  if (!data) {
    return res.cc('缺少data字段')
  }
  const { error } = addFavorite_schema.validate(data)
  if (error) {
    return res.cc(error.details[0].message)
  }
  const { movieId, username } = data
  // 验证当前用户与username是否一致
  if (username !== req.user.username) {
    return res.cc('用户身份认证失败!')
  }
  try {
    // 检查电影是否存在
    const sql = 'select id from movies where id =?'
    const [movieCheck] = await db.query(sql, [movieId])
    if (movieCheck.length === 0) {
      return res.cc('电影不存在!')
    }
    // 检查是否已收藏
    const sql2 = 'select id from favorites where username=? and movieId=?'
    const [resultCheck] = await db.query(sql2, [username, movieId])
    if (resultCheck.length > 0) {
      return res.cc('已收藏过该电影!')
    }
    // 添加收藏
    const SQL = 'insert into favorites(username,movieId) values(?,?)'
    const [resultAdd] = await db.query(SQL, [username, movieId])
    if (resultAdd.affectedRows === 0) {
      return res.cc('添加收藏失败!')
    }
    const newFavorite = {
      id: resultAdd.insertId,
      username,
      movieId,
      documentId: resultAdd.insertId,
    }
    res.success({ message: '添加收藏成功!', data: newFavorite })
  } catch (err) {
    res.cc('添加收藏失败!', 500)
  }
}

// 取消收藏
// DELETE /api/favorites/:id
exports.deleteFavorite = async (req, res) => {
  const { id } = req.params
  if (!id || isNaN(id)) {
    return res.cc('无效的收藏id')
  }
  const username = req.user.username
  try {
    // 长训该收藏是否属于当前用户
    const sql = 'select id from favorites where username=? and id=?'
    const [resultCheck] = await db.query(sql, [username, id])
    if (resultCheck.length === 0) {
      return res.cc('收藏不存在或不属于当前用户,无法取消收藏!')
    }
    const sql1 = 'delete from favorites where username=? and id=?'
    const [result] = await db.query(sql1, [username, id])
    if (result.affectedRows === 0) {
      return res.cc('取消收藏失败!')
    }
    res.status(204).send()
    // res.success({ message: '取消收藏成功!' } })
  } catch (err) {
    res.cc('取消收藏失败!', 500)
  }
}