const Joi = require('joi');

class LoginDto {

  static schema = Joi.object({

    email: Joi.string()
      .email()
      .required(),

    password: Joi.string()
      .min(8)
      .required()

  });

}

module.exports = LoginDto;