const Joi = require('joi');

const GuardianDataActionDto = {
  paramsSchema: Joi.object({
    childId: Joi.string().uuid().required(),
  }),
  bodySchema: Joi.object({
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
};

module.exports = GuardianDataActionDto;
