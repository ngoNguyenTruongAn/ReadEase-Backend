const Joi = require('joi');

class CreateContentDto {
  static schema = Joi.object({
    title: Joi.string().trim().min(3).max(255).required(),
    body: Joi.string().trim().min(50).required(),
    difficulty: Joi.string().valid('EASY', 'MEDIUM', 'HARD').required(),
    age_group: Joi.string().trim().required(),
    cover_image_url: Joi.string().uri().max(500).optional().allow(null, ''),
  });
}

module.exports = CreateContentDto;
