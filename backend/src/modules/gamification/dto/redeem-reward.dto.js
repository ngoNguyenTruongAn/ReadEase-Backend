const Joi = require('joi');

class RedeemRewardDto {}

RedeemRewardDto.schema = Joi.object({
  childId: Joi.string().guid().required(),
  expectedVersion: Joi.number().integer().min(0).required(),
});

module.exports = RedeemRewardDto;
