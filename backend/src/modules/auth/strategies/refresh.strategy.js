/**
 * Refresh Strategy
 *
 * Validates refresh tokens from request body field 'refreshToken'.
 * Uses ConfigService to get JWT secret (no hardcoded fallback).
 */
const { Injectable, Inject } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { PassportStrategy } = require('@nestjs/passport');
const { ExtractJwt, Strategy } = require('passport-jwt');

class RefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  /** @param {ConfigService} configService */
  constructor(configService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt.secret'),
    });
  }

  async validate(payload) {
    return payload;
  }
}

Inject(ConfigService)(RefreshStrategy, undefined, 0);
Injectable()(RefreshStrategy);

module.exports = { RefreshStrategy };
