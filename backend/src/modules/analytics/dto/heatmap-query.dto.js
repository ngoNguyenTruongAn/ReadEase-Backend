const Joi = require('joi');

const HeatmapQueryDto = {
  paramsSchema: Joi.object({
    childId: Joi.string().uuid().required(),
  }),
  querySchema: Joi.object({
    sessionId: Joi.string().uuid().required(),
  }),
};

module.exports = HeatmapQueryDto;
