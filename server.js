const db = require('./db/index.js')
const PORT = process.env.PORT || 1337
const app = require('./app.js')
// 测试数据库连接
db.getConnection().then((conn) => {
  console.log('数据库连接成功')
  conn.release()
}).catch((err) => {
  console.log('数据库连接失败', err.message)
  process.exit(1)
})

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`)
})