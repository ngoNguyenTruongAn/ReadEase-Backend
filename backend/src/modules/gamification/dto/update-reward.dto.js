const Joi = require('joi');

const schema = Joi.object({
  name: Joi.string().trim().min(2).max(100).messages({
    'string.min': 'Reward name must be at least 2 characters',
    'string.max': 'Reward name must be at most 100 characters',
  }),
  description: Joi.string().trim().max(500).allow('', null),
  cost: Joi.number().integer().min(1).max(99999).messages({
    'number.base': 'Cost must be a number',
    'number.min': 'Cost must be at least 1',
  }),
  image_url: Joi.string().uri().max(500).allow('', null),
  is_active: Joi.boolean(),
  stock: Joi.number().integer().min(0).allow(null),
}).min(1).messages({
  'object.min': 'At least one field is required to update',
});

module.exports = { schema };
