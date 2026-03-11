const { Injectable } = require('@nestjs/common');
const { PassportStrategy } = require('@nestjs/passport');
const { ExtractJwt, Strategy } = require('passport-jwt');

class RefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {

  constructor() {

    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'dev-secret-change-this'
    });

  }

  async validate(payload) {
    return payload;
  }

}

Injectable()(RefreshStrategy);

module.exports = { RefreshStrategy };