const db = require('../db/index.js')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { register_schema, login_schema } = require('../schema/user.js')

// 注册用户处理函数
exports.register = async (req, res) => {
  // res.send('ok')
  const { error } = register_schema.validate(req.body)
  if (error) {
    return res.cc(error.details[0].message, 400)
  }

  const { username, password, email } = req.body

  try {
    if (!username) {
      return res.cc('用户名不能为空')
    }
    if (!password) {
      return res.cc('密码不能为空')
    }
    if (!email) {
      return res.cc('邮箱不能为空')
    }
    // 检测用户名或邮箱是否被占用
    const sql1 = 'select * from users where username=? or email=?'
    const [existing] = await db.query(sql1, [username, email])
    if (existing.length > 0) {
      return res.cc('用户名或邮箱已被占用')
    }

    // 密码加密
    const hashedPassword = await bcrypt.hash(password, 10)
    // 插入新用户，使用NOW()函数设置created_at字段
    const sql2 = 'insert into users (username, email, password, created_at) values (?, ?, ?, NOW())'
    const [result] = await db.query(sql2, [username, email, hashedPassword])
    if (result.affectedRows !== 1) {
      return res.cc('注册失败,请稍后重试')
    }
    res.success({ message: '注册成功', data: result }, 200)
    // res.success({ message: '注册成功', data: result }, 200)

  } catch (err) {
    console.log('注册错误:', err)
    return res.cc('注册失败，请稍后重试', 500)
  }
}

// 登录用户处理函数
exports.login = async (req, res) => {
  // res.send('ok')
  const { error } = login_schema.validate(req.body)
  if (error) {
    return res.cc(error.details[0].message, 400)
  }
  // 接收用户登录信息
  const { identifier, password } = req.body
  try {
    const sql = 'select * from users where username=?'
    const [result] = await db.query(sql, [identifier])
    if (result.length !== 1) {
      return res.cc('登录失败，请检查用户名是否正确', 401)
    }
    // 验证密码是否正确
    const compareResult = bcrypt.compareSync(password, result[0].password)
    if (!compareResult) {
      return res.cc('登录失败，请检查密码是否正确', 401)
    }
    // 登陆成功生成jwt token
    const user = { ...result[0], password: '' }
    // 利用.env中的JWT_SECRET将用户信息加密生成token字符串
    const tokenStr = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE })
    // res.success({ message: '登陆成功', jwt: tokenStr }, 200)
    // 6. 返回响应（格式与 Strapi 兼容）
    res.json({
      jwt: tokenStr,
      user: {
        id: result[0].id,
        username: identifier,
        email: result[0].email,
      },
    });
  } catch (err) {
    console.log('登录错误:', err)
    return res.cc('登录失败，请稍后重试', 500)
  }
}
