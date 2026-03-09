/**
 * Health Module
 *
 * Self-contained module for the /api/v1/health endpoint.
 * Import into AppModule to enable health checks.
 */
const { Module } = require('@nestjs/common');
const { HealthController } = require('./health.controller');
const { HealthService } = require('./health.service');

const metadata = {
  controllers: [HealthController],
  providers: [HealthService],
};

class HealthModule {}

Reflect.decorate([Module(metadata)], HealthModule);

module.exports = { HealthModule };
