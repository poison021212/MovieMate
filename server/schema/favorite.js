const joi = require('joi')

exports.addFavorite_schema = joi.object({
  movieId: joi.number().integer().required(),
  username: joi.string().max(100).required(),
})

