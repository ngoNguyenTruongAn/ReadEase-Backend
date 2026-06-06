/**
 * LexicalModule
 *
 * Provides:
 *   - LexicalService   (Gemini simplification + Redis cache)
 *   - LexicalController (POST /api/v1/lexical/simplify)
 *   - REDIS_LEXICAL_CLIENT (dedicated ioredis connection)
 *
 * Exports LexicalService so TrackingModule can inject it into the
 * WebSocket gateway (called on ML REGRESSION state).
 */

const { Module } = require('@nestjs/common');
const Redis = require('ioredis');

const { LexicalService } = require('./lexical.service');
const { LexicalController } = require('./lexical.controller');

class LexicalModule {}

Module({
  controllers: [LexicalController],
  providers: [
    // Dedicated Redis client for lexical caching
    // Separate from REDIS_OTP_CLIENT to allow independent config/TTL management
    {
      provide: 'REDIS_LEXICAL_CLIENT',
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
    LexicalService,
  ],
  exports: [LexicalService],
})(LexicalModule);

module.exports = { LexicalModule };
