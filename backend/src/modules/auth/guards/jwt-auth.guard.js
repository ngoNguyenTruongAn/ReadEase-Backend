/**
 * JWT Auth Guard
 *
 * Protects routes by requiring a valid JWT access token.
 * Uses the 'jwt' Passport strategy (JwtStrategy).
 *
 * Usage: @UseGuards(JwtAuthGuard)
 */
const { AuthGuard } = require('@nestjs/passport');

class JwtAuthGuard extends AuthGuard('jwt') {}

module.exports = { JwtAuthGuard };
