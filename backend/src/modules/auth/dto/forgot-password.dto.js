const Joi = require('joi');

class ForgotPasswordDto {
  static schema = Joi.object({
    email: Joi.string().email().required(),
  });
}

module.exports = ForgotPasswordDto;
