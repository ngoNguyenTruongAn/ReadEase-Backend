const Joi = require('joi');

class VerifyEmailDto {
  static schema = Joi.object({
    email: Joi.string().email().required(),
    code: Joi.string()
      .length(6)
      .pattern(/^\d{6}$/)
      .required()
      .messages({
        'string.length': 'Mã OTP phải có 6 chữ số',
        'string.pattern.base': 'Mã OTP phải là 6 chữ số',
      }),
  });
}

module.exports = VerifyEmailDto;
