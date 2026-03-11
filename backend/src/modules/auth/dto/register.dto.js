const Joi = require('joi');

class RegisterDto {

  static schema = Joi.object({
    email: Joi.string()
      .email()
      .required(),

    password: Joi.string()
      .min(8)
      .required(),

    displayName: Joi.string()
      .min(2)
      .max(50)
      .required(),

    role: Joi.string()
      .valid('ROLE_CHILD', 'ROLE_CLINICIAN', 'ROLE_GUARDIAN')
      .optional()
  });

}

module.exports = RegisterDto;