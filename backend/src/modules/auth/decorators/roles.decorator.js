const { SetMetadata } = require('@nestjs/common');

const Roles = (...roles) => SetMetadata('roles', roles);

module.exports = Roles;
