const joi = require('joi')

exports.chat_schema = joi.object({
  sessionId: joi.number().integer().positive().optional(),
  message: joi.string().trim().min(1).max(2000).required(),
})

exports.create_session_schema = joi.object({
  title: joi.string().trim().max(255).optional(),
})

exports.reply_schema = joi.object({
  content: joi.string().trim().min(1).max(2000).required(),
})

exports.recommendMovieItem_schema = joi.object({
  title: joi.string().required(),
  reason: joi.string().required(),
  year: joi.alternatives().try(joi.number(), joi.string()).optional(),
  tmdb_id: joi.alternatives().try(joi.number(), joi.string()).optional(),
})

exports.chatResponse_schema = joi.object({
  reply: joi.string().required(),
  movies: joi
    .array()
    .items(
      joi.object({
        title: joi.string().required(),
        reason: joi.string().required(),
        year: joi.alternatives().try(joi.number(), joi.string()).optional(),
        tmdb_id: joi.alternatives().try(joi.number(), joi.string()).optional(),
      })
    )
    .max(8)
    .required(),
})
