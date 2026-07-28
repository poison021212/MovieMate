const joi = require('joi')

// 用户名校验规则
exports.register_schema = joi.object({
  // 用户名不能包含空格，且长度在1-15之间，且必填
  username: joi.string().pattern(/^[^\s]+$/).min(1).max(15).required(),
  // 密码只能包含字母、数字、下划线，且长度在6-12之间，且必填
  password: joi.string().pattern(/^[a-zA-Z0-9_]{6,12}$/).required(),
  email: joi.string().email().required(),
})

exports.login_schema = joi.object({
  identifier: joi.string().pattern(/^[^\s]+$/).min(1).max(15).required(),
  password: joi.string().pattern(/^[a-zA-Z0-9_]{6,12}$/).required(),
})
