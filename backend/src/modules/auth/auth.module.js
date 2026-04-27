require('reflect-metadata');

const { Module } = require('@nestjs/common');
const { JwtModule } = require('@nestjs/jwt');
const { ConfigService } = require('@nestjs/config');
const { TypeOrmModule } = require('@nestjs/typeorm');
const Redis = require('ioredis');

const { AuthService } = require('./auth.service');
const { AuthController } = require('./auth.controller');

const { JwtStrategy } = require('./strategies/jwt.strategy');
const { RefreshStrategy } = require('./strategies/refresh.strategy');

const { UserEntity } = require('../users/entities/user.entity');
// NOTE: OtpCodeEntity intentionally removed — OTPs are now stored in Redis.
// The otp_codes PostgreSQL table is kept for historical audit but no longer written to.

const { OtpService } = require('./services/otp.service');
const { EmailService } = require('./services/email.service');

class AuthModule {}

Module({
  imports: [
    // OtpCodeEntity removed from forFeature — no longer read/written by OtpService
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
  providers: [
    // Dedicated Redis client for OTP operations (separate from trajectory buffer)
    {
      provide: 'REDIS_OTP_CLIENT',
      useFactory: () =>
        new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          // Reconnect automatically so a transient restart doesn't crash the app
          lazyConnect: false,
          retryStrategy: (times) => Math.min(times * 100, 3000),
        }),
    },
    AuthService,
    JwtStrategy,
    RefreshStrategy,
    OtpService,
    EmailService,
  ],
  exports: [AuthService],
})(AuthModule);

module.exports = { AuthModule };
