const Joi = require('joi');

class VerifyEmailDto {
  static schema = Joi.object({
    email: Joi.string().email().required(),
    code: Joi.string()
      .length(6)
      .pattern(/^\d{6}$/)
      .required()
      .messages({
        'string.length': 'OTP code must be 6 digits',
        'string.pattern.base': 'OTP code must be 6 digits',
      }),
  });
}

module.exports = VerifyEmailDto;
