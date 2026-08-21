const joi = require('joi')

const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_!@#$%^&*.-]{8,32}$/

const WEAK_PASSWORDS = new Set([
  '12345678',
  'password',
  'password1',
  '11111111',
  'qwerty123',
  'admin123',
  'moviemate',
])

function passwordValidator(value, helpers) {
  if (WEAK_PASSWORDS.has(String(value).toLowerCase())) {
    return helpers.error('any.invalid')
  }
  return value
}

exports.register_schema = joi.object({
  username: joi
    .string()
    .trim()
    .pattern(/^[^\s]+$/)
    .min(1)
    .max(15)
    .required(),
  password: joi
    .string()
    .pattern(PASSWORD_PATTERN)
    .custom(passwordValidator)
    .required()
    .messages({
      'string.pattern.base': '密码需 8-32 位且包含字母与数字',
      'any.invalid': '密码过于简单，请更换',
    }),
  email: joi.string().trim().lowercase().email().required(),
})

exports.login_schema = joi.object({
  identifier: joi.string().trim().min(1).max(255).required(),
  password: joi.string().min(1).max(128).required(),
})

exports.verify_email_schema = joi.object({
  token: joi.string().trim().min(16).max(128).required(),
})

exports.resend_verification_schema = joi.object({
  email: joi.string().trim().lowercase().email().required(),
})

exports.forgot_password_schema = joi.object({
  email: joi.string().trim().lowercase().email().required(),
})

exports.reset_password_schema = joi.object({
  token: joi.string().trim().min(16).max(128).required(),
  password: joi
    .string()
    .pattern(PASSWORD_PATTERN)
    .custom(passwordValidator)
    .required()
    .messages({
      'string.pattern.base': '密码需 8-32 位且包含字母与数字',
      'any.invalid': '密码过于简单，请更换',
    }),
})

exports.refresh_schema = joi.object({
  refreshToken: joi.string().trim().min(16).max(256).optional(),
})

exports.logout_schema = joi.object({
  refreshToken: joi.string().trim().min(16).max(256).optional(),
  allDevices: joi.boolean().optional(),
})
