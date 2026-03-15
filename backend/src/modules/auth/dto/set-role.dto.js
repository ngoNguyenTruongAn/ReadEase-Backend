const Joi = require('joi');

class SetRoleDto {
  static schema = Joi.object({
    role: Joi.string().valid('ROLE_CHILD', 'ROLE_CLINICIAN', 'ROLE_GUARDIAN').required().messages({
      'any.only': 'Role phải là ROLE_CHILD, ROLE_CLINICIAN hoặc ROLE_GUARDIAN',
    }),
  });
}

module.exports = SetRoleDto;
