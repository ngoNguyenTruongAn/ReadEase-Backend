const Joi = require('joi');

const SessionListDto = {
  paramsSchema: Joi.object({
    childId: Joi.string().uuid().required(),
  }),
  querySchema: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
    status: Joi.string().valid('ACTIVE', 'COMPLETED', 'ABANDONED').optional(),
  }),
};

module.exports = SessionListDto;
