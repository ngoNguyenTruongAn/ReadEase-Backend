const { AuthGuard } = require('@nestjs/passport');

class RefreshAuthGuard extends AuthGuard('jwt-refresh') {}

module.exports = { RefreshAuthGuard };
