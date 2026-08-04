const joi = require('joi')

exports.addReview_schema = joi.object({
  date: joi.date().optional(),
  movieId: joi.number().integer().required(),
  rating: joi.number().min(0).max(10).required(),
  content: joi.string().required(),
})

exports.addReply_schema = joi.object({
  content: joi.string().trim().min(1).max(2000).required(),
})