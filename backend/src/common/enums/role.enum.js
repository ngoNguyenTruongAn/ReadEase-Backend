/**
 * Role Enum
 * Must match database CHECK constraint
 */
const Role = {
  CHILD: 'ROLE_CHILD',
  CLINICIAN: 'ROLE_CLINICIAN',
  GUARDIAN: 'ROLE_GUARDIAN'
};

module.exports = { Role };