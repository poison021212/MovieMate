const mysql = require('mysql2/promise')
// 引入环境变量
require('dotenv').config()

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  // 连接池配置
  // 等待连接数超过连接限制时是否等待
  waitForConnections: true,
  // 连接池最大连接数
  connectionLimit: 10,
  // 连接池最大队列数
  queueLimit: 0,
})

// 导出数据库池
module.exports = db
