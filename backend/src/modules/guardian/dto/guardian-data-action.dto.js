const Joi = require('joi');

const GuardianDataActionDto = {
  paramsSchema: Joi.object({
    childId: Joi.string().uuid().required(),
  }),
  exportBodySchema: Joi.object({
    confirmationToken: Joi.string()
      .trim()
      .min(12)
      .max(128)
      .pattern(/^[A-Za-z0-9_-]+$/)
      .required()
      .messages({
        'string.empty': 'confirmationToken is required',
        'string.min': 'confirmationToken must be at least 12 characters',
        'string.pattern.base':
          'confirmationToken must contain only letters, numbers, underscore, or hyphen',
      }),
  }),
  eraseBodySchema: Joi.object({
    otpCode: Joi.string()
      .trim()
      .length(6)
      .pattern(/^[0-9]{6}$/)
      .required()
      .messages({
        'string.empty': 'otpCode is required',
        'string.length': 'otpCode must be exactly 6 digits',
        'string.pattern.base': 'otpCode must contain exactly 6 digits',
      }),
  }),
};

module.exports = GuardianDataActionDto;
