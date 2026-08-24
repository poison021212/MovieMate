/**
 * 测试库初始化（每个 test 会话跑一次）：
 * 1. 创建独立数据库 movie_db_test
 * 2. 执行 init.sql + auth_upgrade.sql 的建表部分（幂等，跳过 USE/ALTER/UPDATE/CREATE DATABASE）
 * 3. 清空业务表，保证用例从干净的库开始
 *
 * 前置：本机 MySQL 可用，且有创建数据库的权限（见 server/.env 的 DB_HOST/DB_USER/DB_PASS）。
 */
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const dotenv = require('dotenv')

const TEST_DB = process.env.TEST_DB_NAME || 'movie_db_test'
const SQL_DIR = path.join(__dirname, '..', 'sql')
const TMP_TABLES = [
  'review_replies',
  'reviews',
  'favorites',
  'ai_recommend_messages',
  'ai_recommend_sessions',
  'email_verification_tokens',
  'password_reset_tokens',
  'refresh_sessions',
  'users',
  'movies',
]

export default async function globalSetup() {
  dotenv.config({ path: path.join(__dirname, '..', '.env') })

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    multipleStatements: true, // SQL 文件包含多条语句，须在连接级开启
  })

  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci`
  )
  await conn.query(`USE \`${TEST_DB}\``)

  // 去掉 USE/ALTER/UPDATE/CREATE DATABASE 语句(可能跨行)与整行注释，只保留幂等的建表与种子语句
  const stripStatements = (text) => {
    const lines = text.split('\n')
    const out = []
    let skipping = false
    for (const raw of lines) {
      if (/^\s*--/.test(raw)) continue // 注释整行直接丢
      if (!skipping && /^\s*(USE\b|ALTER\b|UPDATE\b|CREATE\s+DATABASE\b)/i.test(raw)) {
        skipping = true
      }
      if (skipping) {
        if (raw.trim().endsWith(';')) skipping = false
        continue
      }
      out.push(raw)
    }
    return out.join('\n')
  }

  for (const file of ['init.sql', 'auth_upgrade.sql']) {
    const sql = stripStatements(fs.readFileSync(path.join(SQL_DIR, file), 'utf8'))
    await conn.query(sql)
  }

  // 清空全部业务表（含 movies，避免重复跑 init.sql 时种子电影翻倍），再显式播入固定种子
  await conn.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const table of TMP_TABLES) {
    await conn.query(`TRUNCATE TABLE \`${table}\``)
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1')

  await conn.query(`INSERT INTO movies (title, rating, poster, director, actors, genre, duration, year, summary) VALUES
    ('肖申克的救赎', 9.7, 'https://example/image1.jpg', '弗兰克·德拉邦特', '蒂姆·罗宾斯, 摩根·弗里曼', '剧情', '142 分钟', '1994', '测试种子 1'),
    ('盗梦空间', 9.0, 'https://example/image2.jpg', '克里斯托弗·诺兰', '莱昂纳多·迪卡普里奥', '科幻', '148 分钟', '2010', '测试种子 2'),
    ('千与千寻', 9.4, 'https://example/image3.jpg', '宫崎骏', '柊瑠美, 入野自由', '动画', '125 分钟', '2001', '测试种子 3')`)

  await conn.end()
}