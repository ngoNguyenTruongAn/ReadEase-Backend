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
const Redis      = require('ioredis');

const { LexicalService }    = require('./lexical.service');
const { LexicalController } = require('./lexical.controller');

class LexicalModule {}

Module({
  controllers: [LexicalController],
  providers: [
    // Dedicated Redis client for lexical caching
    // Separate from REDIS_OTP_CLIENT to allow independent config/TTL management
    {
      provide: 'REDIS_LEXICAL_CLIENT',
      useFactory: () =>
        new Redis({
          host:          process.env.REDIS_HOST  || 'localhost',
          port:          parseInt(process.env.REDIS_PORT || '6379', 10),
          lazyConnect:   false,
          retryStrategy: (times) => Math.min(times * 100, 3000),
        }),
    },
    LexicalService,
  ],
  exports: [LexicalService],
})(LexicalModule);

module.exports = { LexicalModule };
