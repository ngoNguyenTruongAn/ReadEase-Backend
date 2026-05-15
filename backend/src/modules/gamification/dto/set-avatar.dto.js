const Joi = require('joi');

const schema = Joi.object({
  rewardId: Joi.string()
    .guid({ version: ['uuidv4'] })
    .required()
    .messages({
      'string.guid': 'rewardId must be a valid UUID',
      'any.required': 'rewardId is required',
    }),
});

module.exports = { schema };
