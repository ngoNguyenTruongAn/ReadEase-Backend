const Joi = require('joi');

const LinkChildDto = {
  schema: Joi.object({
    inviteCode: Joi.string()
      .trim()
      .min(6)
      .max(10)
      .pattern(/^[A-Z0-9]+$/)
      .required()
      .messages({
        'string.empty': 'inviteCode is required',
        'string.min': 'inviteCode must be at least 6 characters',
        'string.pattern.base': 'inviteCode must contain only uppercase letters and numbers',
      }),
  }),
};

module.exports = LinkChildDto;
