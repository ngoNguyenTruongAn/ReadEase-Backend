const Joi = require('joi');

class ResetPasswordDto {
  static schema = Joi.object({
    email: Joi.string().email().required(),
    code: Joi.string().length(6).pattern(/^\d{6}$/).required()
      .messages({
        'string.length': 'Mã OTP phải có 6 chữ số',
        'string.pattern.base': 'Mã OTP phải là 6 chữ số',
      }),
    newPassword: Joi.string().min(8).required()
      .messages({
        'string.min': 'Mật khẩu mới phải ít nhất 8 ký tự',
      }),
  });
}

module.exports = ResetPasswordDto;
