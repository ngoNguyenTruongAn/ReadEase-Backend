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
    'number.max': 'Cost must be at most 99999',
  }),
  image_url: Joi.string().trim().uri().max(1000).allow('', null),
  stock: Joi.number().integer().min(0).allow(null).messages({
    'number.base': 'Stock must be a number or null (unlimited)',
    'number.min': 'Stock cannot be negative',
  }),
  is_active: Joi.boolean(),
}).min(1).messages({
  'object.min': 'At least one field must be provided to update',
});

module.exports = { schema };
