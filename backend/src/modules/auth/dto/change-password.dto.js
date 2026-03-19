const Joi = require('joi');

class ChangePasswordDto {
  static schema = Joi.object({
    oldPassword: Joi.string().min(8).required().messages({
      'string.min': 'Old password must be at least 8 characters',
    }),
    newPassword: Joi.string().min(8).required().messages({
      'string.min': 'New password must be at least 8 characters',
    }),
  });
}

module.exports = ChangePasswordDto;
