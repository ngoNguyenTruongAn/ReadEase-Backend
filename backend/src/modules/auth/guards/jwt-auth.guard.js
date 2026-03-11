const { AuthGuard } = require('@nestjs/passport');

class JwtAuthGuard extends AuthGuard('jwt') {}

module.exports = JwtAuthGuard;
