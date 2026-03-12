/**
 * Roles Decorator
 *
 * Sets required roles metadata on a route handler.
 * Used by RolesGuard to check access.
 *
 * Usage: @Roles('ROLE_CHILD', 'ROLE_CLINICIAN')
 */
const { SetMetadata } = require('@nestjs/common');

const Roles = (...roles) => SetMetadata('roles', roles);

module.exports = { Roles };
