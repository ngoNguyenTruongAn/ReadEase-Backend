const Joi = require('joi');

class HistoryQueryDto {}

HistoryQueryDto.schema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
});

module.exports = HistoryQueryDto;
