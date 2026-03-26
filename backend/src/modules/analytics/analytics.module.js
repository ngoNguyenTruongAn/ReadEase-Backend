const { Module } = require('@nestjs/common');

const { AnalyticsController } = require('./analytics.controller');
const { AnalyticsService } = require('./analytics.service');

class AnalyticsModule {}

Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})(AnalyticsModule);

module.exports = { AnalyticsModule };
