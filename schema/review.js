const joi = require('joi')

exports.addReview_schema = joi.object({
  // 移除了date字段，由后端自动生成
  // 日期格式为 ISO 8601 格式，例如：2023-10-10 格式
  date: joi.date().required(),
  movieId: joi.number().integer().required(),
  rating: joi.number().min(0).max(10).required(),
  content: joi.string().required(),
})