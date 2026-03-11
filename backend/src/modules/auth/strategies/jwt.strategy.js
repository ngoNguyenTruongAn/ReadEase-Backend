const { Injectable } = require('@nestjs/common');
const { PassportStrategy } = require('@nestjs/passport');
const { ExtractJwt, Strategy } = require('passport-jwt');

class JwtStrategy extends PassportStrategy(Strategy) {

  constructor() {

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'dev-secret-change-this'
    });

  }

  async validate(payload) {
    return payload;
  }

}

Injectable()(JwtStrategy);

module.exports = { JwtStrategy };