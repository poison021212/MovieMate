const express = require('express')
const app = express()
const joi = require('joi')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const path = require('path')

/** 开发/Demo：允许 localhost、127.0.0.1、私网 IP + 常见前端端口 */
function isAllowedOrigin(origin) {
  if (!origin) return true
  try {
    const url = new URL(origin)
    const host = url.hostname
    const port = url.port || (url.protocol === 'https:' ? '443' : '80')
    const devPorts = new Set(['5173', '4173', '3000', '1337', '443', '80'])

    if (host === 'localhost' || host === '127.0.0.1') {
      return devPorts.has(port)
    }

    if (
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
    ) {
      return devPorts.has(port)
    }

    const publicUrl = process.env.APP_PUBLIC_URL
    if (publicUrl) {
      try {
        if (new URL(publicUrl).origin === origin) return true
      } catch {
        if (publicUrl.replace(/\/$/, '') === origin) return true
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      return devPorts.has(port)
    }

    return false
  } catch {
    return false
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, origin || true)
      } else {
        callback(null, false)
      }
    },
    credentials: true,
  })
)
app.use(cookieParser())
app.use(express.urlencoded({ extended: false }))
app.use(express.json())

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')))

app.use(function (req, res, next) {
  res.success = function (data, status = 200) {
    res.status(status).json(data)
  }
  res.cc = function (err, status = 400) {
    const message = err instanceof Error ? err.message : err
    res.status(status).json({ error: { message } })
  }
  next()
})

const aiRouter = require('./router/ai.js')
app.use('/api', aiRouter)
const userRouter = require('./router/user.js')
app.use('/api', userRouter)
const movieRouter = require('./router/movie.js')
app.use('/api', movieRouter)
const reviewRouter = require('./router/review.js')
app.use('/api', reviewRouter)
const favoriteRouter = require('./router/favorite.js')
app.use('/api', favoriteRouter)
const analyticsRouter = require('./router/analytics.js')
app.use('/api', analyticsRouter)
const adminRouter = require('./router/admin.js')
app.use('/api/admin', adminRouter)

app.use(function (err, req, res, next) {
  if (err instanceof joi.ValidationError) {
    return res.cc(err)
  }
  if (err.name === 'UnauthorizedError') {
    return res.cc('身份认证失败!')
  }
  console.error('Unhandled error:', err)
  return res.cc(err?.message || '服务器内部错误', 500)
})

module.exports = app
