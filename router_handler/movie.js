const db = require('../db/index.js')

// 获取所有电影
exports.getMovies = async (req, res) => {
  try {
    // SELECT * FROM movies order by id desc表示按id降序查询所有电影数据,默认按照id升序
    const sql = 'SELECT * FROM movies order by id asc'
    const [result] = await db.query(sql)
    const data = result.map(movie => ({
      ...movie, documentId: movie.id
    }))
    res.success({ message: '获取电影列表成功', data }, 200)
  } catch (err) {
    res.cc('获取电影列表失败')
  }
}

// 获取单部电影详情
exports.getMovieById = async (req, res) => {
  // 从请求参数中获取电影id
  const { id } = req.params
  if (!id || isNaN(id)) {
    res.cc('电影id参数错误')
  }
  try {
    const sql = 'SELECT * FROM movies where id=?'
    const [result] = await db.query(sql, [id])
    res.success({ message: '获取电影详情成功', data: result[0] }, 200)
  } catch (err) {
    res.cc('获取电影详情失败', 500)
  }
}
