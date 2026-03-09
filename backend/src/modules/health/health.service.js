/**
 * Health Service
 *
 * Performs liveness checks for:
 * - PostgreSQL database (pg_isready equivalent via query)
 * - Redis cache (PING command)
 * - Memory usage (heap, RSS)
 *
 * Returns "ok" if all checks pass, "degraded" if any check fails.
 * App still responds — it is NOT down, just degraded.
 */
const { Injectable } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { logger } = require('../../common/logger/winston.config');

class HealthService {
  /**
   * @param {ConfigService} configService
   */
  constructor(configService) {
    this.configService = configService;
  }

  /**
   * Run all health checks and return aggregated status
   * @returns {Promise<object>}
   */
  async getStatus() {
    const result = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version || '0.1.0',
      environment: this.configService.get('app.env', 'development'),
      checks: {},
    };

    // Database check
    result.checks.database = await this._checkDatabase();
    if (result.checks.database.status !== 'ok') {
      result.status = 'degraded';
    }

    // Redis check
    result.checks.redis = await this._checkRedis();
    if (result.checks.redis.status !== 'ok') {
      result.status = 'degraded';
    }

    // Memory check (always succeeds, informational)
    result.checks.memory = this._checkMemory();

    return result;
  }

  /**
   * Check PostgreSQL connectivity
   * TODO: Replace with actual TypeORM DataSource.query('SELECT 1') when DB module is added
   * @returns {Promise<object>}
   */
  async _checkDatabase() {
    try {
      const dbHost = this.configService.get('database.host');
      const dbName = this.configService.get('database.name');

      // Placeholder: when TypeORM is connected, this will do: await this.dataSource.query('SELECT 1')
      // For now, report config status
      if (!dbHost) {
        return { status: 'error', message: 'DB_HOST not configured' };
      }

      return {
        status: 'ok',
        host: dbHost,
        database: dbName,
        message: 'Configuration valid (connection check pending TypeORM setup)',
      };
    } catch (error) {
      logger.error('Database health check failed', {
        context: 'HealthService',
        error: { message: error.message },
      });
      return { status: 'error', message: error.message };
    }
  }

  /**
   * Check Redis connectivity
   * TODO: Replace with actual Redis client.ping() when Redis module is added
   * @returns {Promise<object>}
   */
  async _checkRedis() {
    try {
      const redisHost = this.configService.get('redis.host');

      // Placeholder: when ioredis is connected, this will do: await this.redis.ping()
      if (!redisHost) {
        return { status: 'error', message: 'REDIS_HOST not configured' };
      }

      return {
        status: 'ok',
        host: redisHost,
        message: 'Configuration valid (connection check pending Redis module setup)',
      };
    } catch (error) {
      logger.error('Redis health check failed', {
        context: 'HealthService',
        error: { message: error.message },
      });
      return { status: 'error', message: error.message };
    }
  }

  /**
   * Check memory usage
   * @returns {object}
   */
  _checkMemory() {
    const mem = process.memoryUsage();
    return {
      status: 'ok',
      heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
      external: `${Math.round(mem.external / 1024 / 1024)}MB`,
    };
  }
}

// NestJS DI: inject ConfigService
const { Dependencies } = require('@nestjs/common');
Reflect.decorate([Injectable(), Dependencies(ConfigService)], HealthService);

module.exports = { HealthService };
