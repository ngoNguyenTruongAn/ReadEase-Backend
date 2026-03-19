const Joi = require('joi');

class ResetPasswordDto {
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
    newPassword: Joi.string().min(8).required().messages({
      'string.min': 'New password must be at least 8 characters',
    }),
  });
}

module.exports = ResetPasswordDto;
