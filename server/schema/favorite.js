const joi = require('joi')

exports.addFavorite_schema = joi.object({
  movieId: joi.number().integer().required(),
})

