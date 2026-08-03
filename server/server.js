const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const db = require('./db/index.js')
const PORT = process.env.PORT || 1337
const app = require('./app.js')

db.getConnection()
  .then((conn) => {
    console.log('数据库连接成功')
    conn.release()
  })
  .catch((err) => {
    console.log('数据库连接失败', err.message)
    process.exit(1)
  })

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`)
})
