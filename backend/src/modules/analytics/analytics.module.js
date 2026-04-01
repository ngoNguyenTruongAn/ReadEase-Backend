const { Module } = require('@nestjs/common');

const { AnalyticsController } = require('./analytics.controller');
const { SessionsController } = require('./sessions.controller');
const { AnalyticsService } = require('./analytics.service');

class AnalyticsModule {}

Module({
  controllers: [AnalyticsController, SessionsController],
  providers: [AnalyticsService],
})(AnalyticsModule);

module.exports = { AnalyticsModule };
