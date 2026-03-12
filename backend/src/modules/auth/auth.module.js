require('reflect-metadata');

const { Module } = require('@nestjs/common');
const { JwtModule } = require('@nestjs/jwt');
const { ConfigService } = require('@nestjs/config');
const { TypeOrmModule } = require('@nestjs/typeorm');

const { AuthService } = require('./auth.service');
const { AuthController } = require('./auth.controller');

const { JwtStrategy } = require('./strategies/jwt.strategy');
const { RefreshStrategy } = require('./strategies/refresh.strategy');

const { UserEntity } = require('../users/entities/user.entity');

class AuthModule {}

Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService) => ({
        secret: configService.get('jwt.secret'),
        signOptions: { expiresIn: `${configService.get('jwt.accessTtl', 900)}s` },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RefreshStrategy],
  exports: [AuthService],
})(AuthModule);

module.exports = { AuthModule };
