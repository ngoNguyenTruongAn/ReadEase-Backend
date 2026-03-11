const Joi = require('joi');

class RefreshTokenDto {
  static schema = Joi.object({
    refreshToken: Joi.string().required(),
  });
}

module.exports = RefreshTokenDto;
