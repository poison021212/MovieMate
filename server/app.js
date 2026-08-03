const express = require('express')
const app = express()
const joi = require('joi')
const cors = require('cors')
app.use(cors())
app.use(express.urlencoded({ extended: false }))
app.use(express.json())

const path = require('path');
// 允许访问 public 目录下的文件
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// 注册中间件，封装res.success和res.error函数（防止多次使用res.send），优化代码
app.use(function (req, res, next) {
  // 成功响应
  res.success = function (data, status = 200) {
    res.status(status).json(data);
  };
  // 错误响应（兼容 Strapi 格式）
  res.cc = function (err, status = 400) {
    const message = err instanceof Error ? err.message : err;
    res.status(status).json({ error: { message } });
  };
  next();
});

const aiRouter = require('./router/ai.js')
app.use('/api', aiRouter)
// 导入并注册路由模块
const userRouter = require('./router/user.js')
app.use('/api', userRouter)
// 导入并注册路由模块
const movieRouter = require('./router/movie.js')
app.use('/api', movieRouter)
// 导入并注册路由模块
const reviewRouter = require('./router/review.js')
app.use('/api', reviewRouter)
// 导入并注册路由模块
const favoriteRouter = require('./router/favorite.js')
app.use('/api', favoriteRouter)


// 错误处理中间件
app.use(function (err, req, res, next) {
  // 1. 检查err是否是joi模块抛出的错误对象
  if (err instanceof joi.ValidationError) {
    // 2. 如果是joi模块抛出的错误对象，返回错误信息
    return res.cc(err)
  }
  // 捕获身份认证失败的错误
  if (err.name === 'UnauthorizedError') {
    return res.cc('身份认证失败!')
  }
})

module.exports = app
