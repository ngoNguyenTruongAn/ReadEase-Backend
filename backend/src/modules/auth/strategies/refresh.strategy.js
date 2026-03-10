const { Injectable } = require('@nestjs/common');
const { PassportStrategy } = require('@nestjs/passport');
const { ExtractJwt, Strategy } = require('passport-jwt');

class RefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {

  constructor() {

    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      secretOrKey: process.env.JWT_SECRET || 'secretKey'
    });

  }

  async validate(payload) {
    return payload;
  }

}

Injectable()(RefreshStrategy);

module.exports = { RefreshStrategy };