const Joi = require('joi');

class UpdateContentDto {
  static schema = Joi.object({
    title: Joi.string().trim().min(3).max(255).optional(),
    body: Joi.string().trim().min(50).optional(),
    difficulty: Joi.string().valid('EASY', 'MEDIUM', 'HARD').optional(),
    age_group: Joi.string().trim().optional(),
    cover_image_url: Joi.string().uri().max(500).optional().allow(null, ''),
  }).min(1);
}

module.exports = UpdateContentDto;
