const db = require('../db/index.js')
const { addReview_schema, addReply_schema } = require('../schema/review.js')

// 获取所有评论
exports.getReviews = async (req, res) => {
  try {
    const sql = 'select * from reviews order by id'
    const [result] = await db.query(sql)
    // 转换为 Strapi 格式：每个对象添加 documentId
    const data = result.map(review => ({
      ...review, documentId: review.id,
      // 日期格式化为中文时间格式
      // 例如：2023-10-10 14:30:00
      date: review.date ? new Date(review.date).toLocaleString('zh-CN', { hour12: false }) : null
    }))
    if (data.length === 0) {
      res.success('暂无评论')
    }
    res.success({ data })
  } catch (err) {
    res.cc('获取评论失败', 500)
  }
}

// 添加评论
exports.addReviews = async (req, res) => {
  // 前端请求体结构: { data: { movieId, username, date, rating, content } }
  const { data } = req.body
  if (!data) {
    return res.cc('缺少data字段')
  }
  // 验证请求体数据是否符合要求
  const { error } = addReview_schema.validate(data)
  if (error) {
    return res.cc(error.details[0].message)
  }
  // date拿走，由后端自动生成
  const { movieId, rating, content } = data
  const username = req.user.username
  try {
    const sql = 'select id from movies where id=?'
    // 可选：检查 movieId 对应的电影是否存在（外键约束会自动检查，但可以提前友好提示）
    const [checkResult] = await db.query(sql, [movieId])
    if (checkResult.length === 0) {
      return res.cc('电影不存在')
    }
    const sql1 = 'insert into reviews (movieId,username,rating,content,date) values (?,?,?,?,NOW())'
    const [result] = await db.query(sql1, [movieId, username, rating, content])
    // 返回新增的评论（Strapi 格式）
    const newReview = {
      id: result.insertId,
      movieId,
      username,
      rating,
      content,
      // 日期格式化为中文时间格式或者不写让后端自动生成，否则会报错
      // date要符合数据库格式，否则会报错
      date: new Date().toISOString(),
      // 转为字符串和前端匹配
      documentId: result.insertId,
    };
    res.success({ message: '添加评论成功', data: newReview }, 201);
  } catch (err) {
    res.cc('添加评论失败', 500)
  }
}

// 删除评论
exports.deleteReviews = async (req, res) => {
  const { id } = req.params
  if (!id || isNaN(id)) {
    res.cc('评论id参数错误')
  }
  const username = req.user.username
  try {
    // 检查评论是否是当前用户发布的
    const [check] = await db.query('select * from reviews where username=? and id=?', [username, id])
    if (check.length === 0) {
      return res.cc('评论不存在或无权删除', 404)
    }




    const sql = 'delete from reviews where username=? and id=?'
    const [result] = await db.query(sql, [username, id])
    if (result.affectedRows === 0) {
      return res.cc('删除失败')
    }
    // 成功删除，通常返回 204 No Content 或成功消息
    res.status(204).send(); // 无内容，符合 RESTful
    // res.success({ message: '删除成功' })
  } catch (err) {
    res.cc('删除评论失败', 500)
  }
}

exports.getReviewReplies = async (req, res) => {
  const reviewId = Number(req.params.id)
  if (!reviewId) return res.cc('评论 id 无效', 400)
  try {
    const [reviewCheck] = await db.query('SELECT id FROM reviews WHERE id = ?', [reviewId])
    if (!reviewCheck.length) return res.cc('评论不存在', 404)
    const [rows] = await db.query(
      'SELECT id, review_id, username, content, date FROM review_replies WHERE review_id = ? ORDER BY id ASC',
      [reviewId]
    )
    const data = rows.map((row) => ({
      ...row,
      documentId: row.id,
      date: row.date ? new Date(row.date).toLocaleString('zh-CN', { hour12: false }) : null,
    }))
    res.success({ data })
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.cc('缺少 review_replies 表，请执行 server/sql/ai_chat_and_replies.sql', 503)
    }
    console.error('getReviewReplies', err)
    res.cc('获取回复失败', 500)
  }
}

exports.addReviewReply = async (req, res) => {
  const reviewId = Number(req.params.id)
  if (!reviewId) return res.cc('评论 id 无效', 400)
  const { error } = addReply_schema.validate(req.body || {})
  if (error) return res.cc(error.details[0].message, 400)
  const username = req.user.username
  const { content } = req.body
  try {
    const [reviewCheck] = await db.query('SELECT id FROM reviews WHERE id = ?', [reviewId])
    if (!reviewCheck.length) return res.cc('评论不存在', 404)
    const [result] = await db.query(
      'INSERT INTO review_replies (review_id, username, content, date) VALUES (?, ?, ?, NOW())',
      [reviewId, username, content]
    )
    res.success(
      {
        message: '回复成功',
        data: {
          id: result.insertId,
          documentId: result.insertId,
          review_id: reviewId,
          username,
          content,
          date: new Date().toISOString(),
        },
      },
      201
    )
  } catch (err) {
    res.cc('回复失败', 500)
  }
}

exports.deleteReply = async (req, res) => {
  const replyId = Number(req.params.replyId)
  if (!replyId) return res.cc('回复 id 无效', 400)
  const username = req.user.username
  try {
    const [check] = await db.query(
      'SELECT id FROM review_replies WHERE id = ? AND username = ?',
      [replyId, username]
    )
    if (!check.length) return res.cc('回复不存在或无权删除', 404)
    await db.query('DELETE FROM review_replies WHERE id = ? AND username = ?', [replyId, username])
    res.status(204).send()
  } catch (err) {
    res.cc('删除回复失败', 500)
  }
}
