const Joi = require('joi');

const ReplayParamsDto = {
  paramsSchema: Joi.object({
    sessionId: Joi.string().uuid().required(),
  }),
};

module.exports = ReplayParamsDto;
