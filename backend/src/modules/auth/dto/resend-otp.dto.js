const Joi = require('joi');

class ResendOtpDto {
  static schema = Joi.object({
    email: Joi.string().email().required(),
  });
}

module.exports = ResendOtpDto;
