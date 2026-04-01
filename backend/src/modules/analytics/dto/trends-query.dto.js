const Joi = require('joi');

const TrendsQueryDto = {
  paramsSchema: Joi.object({
    childId: Joi.string().uuid().required(),
  }),
  querySchema: Joi.object({
    days: Joi.number().integer().min(1).max(90).default(7),
  }),
};

module.exports = TrendsQueryDto;
