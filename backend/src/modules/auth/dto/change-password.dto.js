const Joi = require('joi');

class ChangePasswordDto {
  static schema = Joi.object({
    oldPassword: Joi.string().min(8).required()
      .messages({
        'string.min': 'Mật khẩu cũ phải ít nhất 8 ký tự',
      }),
    newPassword: Joi.string().min(8).required()
      .messages({
        'string.min': 'Mật khẩu mới phải ít nhất 8 ký tự',
      }),
  });
}

module.exports = ChangePasswordDto;
