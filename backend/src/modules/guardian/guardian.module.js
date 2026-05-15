require('reflect-metadata');

const { Module } = require('@nestjs/common');
const Redis = require('ioredis');

const { GuardianController } = require('./guardian.controller');
const { GuardianService } = require('./guardian.service');
const { GuardianThrottlerGuard } = require('./guards/guardian-throttler.guard');
const { OtpService } = require('../auth/services/otp.service');
const { EmailService } = require('../auth/services/email.service');

class GuardianModule {}

Module({
  controllers: [GuardianController],
  providers: [
    {
      provide: 'REDIS_OTP_CLIENT',
      useFactory: () =>
        new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          lazyConnect: false,
          retryStrategy: (times) => Math.min(times * 100, 3000),
        }),
    },
    GuardianService,
    GuardianThrottlerGuard,
    OtpService,
    EmailService,
  ],
  exports: [GuardianService],
})(GuardianModule);

module.exports = { GuardianModule };
