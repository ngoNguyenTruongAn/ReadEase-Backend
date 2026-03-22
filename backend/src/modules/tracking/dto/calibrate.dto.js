const Joi = require('joi');

const CalibrateDto = {
  schema: Joi.object({
    childId: Joi.string().uuid().optional(),
    duration: Joi.number().integer().min(1000).max(120000).default(30000),
    gameType: Joi.string().trim().max(100).default('target_tracking'),
    events: Joi.array()
      .items(
        Joi.object({
          x: Joi.number().required(),
          y: Joi.number().required(),
          timestamp: Joi.number().required(),
        }).required(),
      )
      .min(3)
      .required(),
  }).required(),
};

module.exports = CalibrateDto;
