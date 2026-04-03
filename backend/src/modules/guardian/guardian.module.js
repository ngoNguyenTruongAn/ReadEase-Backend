require('reflect-metadata');

const { Module } = require('@nestjs/common');

const { GuardianController } = require('./guardian.controller');
const { GuardianService } = require('./guardian.service');
const { GuardianThrottlerGuard } = require('./guards/guardian-throttler.guard');

class GuardianModule {}

Module({
  controllers: [GuardianController],
  providers: [GuardianService, GuardianThrottlerGuard],
  exports: [GuardianService],
})(GuardianModule);

module.exports = { GuardianModule };
