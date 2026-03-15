const Joi = require('joi');

class QueryContentDto {
	static schema = Joi.object({
		page: Joi.number().integer().min(1).default(1),
		limit: Joi.number().integer().min(1).max(50).default(10),
		difficulty: Joi.string().valid('EASY', 'MEDIUM', 'HARD').optional(),
		age_group: Joi.string().trim().optional(),
	});
}

module.exports = QueryContentDto;
