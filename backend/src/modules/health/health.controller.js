/**
 * Health Controller
 *
 * GET /api/v1/health — Public endpoint, no authentication required.
 * Returns service status, uptime, and dependency checks.
 */
const { Controller, Get, Dependencies } = require('@nestjs/common');
const { HealthService } = require('./health.service');

class HealthController {
  /**
   * @param {HealthService} healthService
   */
  constructor(healthService) {
    this.healthService = healthService;
  }

  /**
   * GET /api/v1/health
   * @returns {Promise<object>} Health status with checks
   */
  async check() {
    return this.healthService.getStatus();
  }
}

// NestJS decorators via Reflect.decorate
Reflect.decorate([Controller('api/v1/health'), Dependencies(HealthService)], HealthController);

// Method decorator: must use Object.getOwnPropertyDescriptor
const descriptor = Object.getOwnPropertyDescriptor(HealthController.prototype, 'check');
Reflect.decorate([Get()], HealthController.prototype, 'check', descriptor);

module.exports = { HealthController };
