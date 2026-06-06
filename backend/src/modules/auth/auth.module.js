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
      useFactory: () => {
        const url = process.env.REDIS_URL;
        const host = process.env.REDIS_HOST || 'localhost';
        const port = parseInt(process.env.REDIS_PORT || '6379', 10);
        const password = process.env.REDIS_PASSWORD || undefined;
        const tlsEnabled = process.env.REDIS_TLS === 'true' || process.env.REDIS_TLS === '1';

        const redisOptions = {
          lazyConnect: false,
          retryStrategy: (times) => Math.min(times * 100, 3000),
        };
        if (password) {
          redisOptions.password = password;
        }
        if (tlsEnabled) {
          redisOptions.tls = {};
        }

        return url ? new Redis(url, redisOptions) : new Redis({ host, port, ...redisOptions });
      },
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
