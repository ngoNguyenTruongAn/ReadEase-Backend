require('reflect-metadata')

const { Module } = require('@nestjs/common')
const { JwtModule } = require('@nestjs/jwt')
const { TypeOrmModule } = require('@nestjs/typeorm')

const { AuthService } = require('./auth.service')
const { AuthController } = require('./auth.controller')

const { JwtStrategy } = require('./strategies/jwt.strategy')
const { RefreshStrategy } = require('./strategies/refresh.strategy')

const {  UserEntity } = require('../users/entities/user.entity')

class AuthModule {}

Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    JwtModule.register({})
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshStrategy
  ]
})(AuthModule)

module.exports = { AuthModule }