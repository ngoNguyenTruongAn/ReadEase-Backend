const { Injectable, Inject } = require('@nestjs/common');
const Redis = require('ioredis');

const { logger } = require('../../../common/logger/winston.config');

const { redis_flush_latency } = require('../../../common/observability/metrics');

const ReplayStorageService = require('./replay-storage.service');

class TrajectoryBufferService {
  constructor(replayStorageService) {
    this.replayStorage = replayStorageService;

    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    });

    this.prefix = process.env.REDIS_TRAJECTORY_PREFIX || 'trajectory';

    this.flushInterval = parseInt(process.env.REDIS_FLUSH_INTERVAL || '5000');

    this.flushing = false;

    setInterval(() => this.flushAll(), this.flushInterval);
  }

  getKey(sessionId) {
    return `${this.prefix}:${sessionId}`;
  }

  async push(sessionId, userId, points) {
    const key = this.getKey(sessionId);

    try {
      const pipeline = this.redis.pipeline();

      for (const p of points) {
        pipeline.rpush(
          key,
          JSON.stringify({
            type: 'mouse_move',
            userId,
            ...p,
          }),
        );
      }

      await pipeline.exec();
    } catch (err) {
      logger.error('Redis RPUSH failed', {
        context: 'TrajectoryBufferService',
        data: { error: err.message },
      });
    }
  }

  async flushSession(sessionId) {
    const end = redis_flush_latency.startTimer();

    const key = this.getKey(sessionId);

    try {
      const events = await this.redis.lrange(key, 0, -1);

      if (!events || events.length === 0) {
        return;
      }

      const parsed = events.map((e) => JSON.parse(e));

      await this.replayStorage.storeEvents(sessionId, parsed);

      await this.redis.del(key);

      logger.info('Redis session flushed', {
        context: 'TrajectoryBufferService',
        data: {
          sessionId,
          events: parsed.length,
        },
      });
    } catch (err) {
      logger.error('Redis flush failed', {
        context: 'TrajectoryBufferService',
        data: {
          sessionId,
          error: err.message,
        },
      });
    } finally {
      end();
    }
  }

  async flushAll() {
    if (this.flushing) {
      return;
    }

    this.flushing = true;

    let cursor = '0';

    try {
      do {
        const reply = await this.redis.scan(cursor, 'MATCH', `${this.prefix}:*`, 'COUNT', 100);

        cursor = reply[0];
        const keys = reply[1];

        for (const key of keys) {
          const sessionId = key.split(':')[1];

          await this.flushSession(sessionId);
        }
      } while (cursor !== '0');
    } catch (err) {
      logger.error('SCAN flush error', {
        context: 'TrajectoryBufferService',
        data: { error: err.message },
      });
    } finally {
      this.flushing = false;
    }
  }
}

Injectable()(TrajectoryBufferService);

Inject(ReplayStorageService)(TrajectoryBufferService, undefined, 0);

module.exports = TrajectoryBufferService;
