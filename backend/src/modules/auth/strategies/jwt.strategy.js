/**
 * JWT Strategy
 *
 * Validates access tokens from Authorization: Bearer header.
 * Uses ConfigService to get JWT secret (no hardcoded fallback).
 */
const { Injectable, Inject } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { PassportStrategy } = require('@nestjs/passport');
const { ExtractJwt, Strategy } = require('passport-jwt');

class JwtStrategy extends PassportStrategy(Strategy) {
  /** @param {ConfigService} configService */
  constructor(configService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt.secret'),
    });
  }

  async validate(payload) {
    return payload;
  }
}

Inject(ConfigService)(JwtStrategy, undefined, 0);
Injectable()(JwtStrategy);

module.exports = { JwtStrategy };
