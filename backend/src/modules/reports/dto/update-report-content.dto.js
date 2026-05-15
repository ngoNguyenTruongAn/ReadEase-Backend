const Joi = require('joi');

class UpdateReportContentDto {
  static schema = Joi.object({
    content: Joi.string().trim().min(1).max(50000).required(),
  });
}

module.exports = UpdateReportContentDto;
