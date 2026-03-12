/**
 * Health Service
 *
 * Performs liveness checks for:
 * - PostgreSQL database (SELECT 1)
 * - Redis cache (config check — real PING when Redis module added)
 * - Memory usage (heap, RSS)
 *
 * Returns "ok" if all checks pass, "degraded" if any check fails.
 */
const { Injectable } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { DataSource } = require('typeorm');
const { logger } = require('../../common/logger/winston.config');

class HealthService {
  /**
   * @param {ConfigService} configService
   * @param {DataSource} dataSource
   */
  constructor(configService, dataSource) {
    this.configService = configService;
    this.dataSource = dataSource;
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

    // Database check — real query
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
   * Check PostgreSQL connectivity via real query
   * @returns {Promise<object>}
   */
  async _checkDatabase() {
    try {
      const startMs = Date.now();
      await this.dataSource.query('SELECT 1');
      const durationMs = Date.now() - startMs;

      return {
        status: 'ok',
        host: this.configService.get('database.host'),
        database: this.configService.get('database.name'),
        responseTimeMs: durationMs,
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
   * TODO: Replace with real Redis client.ping() when Redis module is added
   * @returns {Promise<object>}
   */
  async _checkRedis() {
    try {
      const redisHost = this.configService.get('redis.host');

      if (!redisHost) {
        return { status: 'error', message: 'REDIS_HOST not configured' };
      }

      return {
        status: 'ok',
        host: redisHost,
        message: 'Configuration valid (real PING pending Redis module)',
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

// NestJS DI: inject ConfigService + DataSource
const { Dependencies } = require('@nestjs/common');
Reflect.decorate([Injectable(), Dependencies(ConfigService, DataSource)], HealthService);

module.exports = { HealthService };
