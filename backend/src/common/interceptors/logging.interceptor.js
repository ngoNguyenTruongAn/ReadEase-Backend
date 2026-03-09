/**
 * Logging Interceptor
 *
 * Logs every HTTP request/response following ReadEase logging standards:
 * - Request received: method, path, userAgent, requestId
 * - Request completed: method, path, statusCode, durationMs, requestId
 *
 * Uses Winston logger (not console.log).
 */
const { Injectable } = require('@nestjs/common');
const { tap } = require('rxjs/operators');
const { logger } = require('../logger/winston.config');

class LoggingInterceptor {
  /**
   * @param {ExecutionContext} context
   * @param {CallHandler} next
   * @returns {Observable}
   */
  intercept(context, next) {
    const request = context.switchToHttp().getRequest();
    const { method, url, headers } = request;
    const requestId = request.requestId || 'no-request-id';
    const startTime = Date.now();

    // Log request received
    logger.info('Request received', {
      context: 'LoggingInterceptor',
      requestId,
      data: {
        method,
        path: url,
        userAgent: headers['user-agent'] || 'unknown',
      },
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const durationMs = Date.now() - startTime;

          // Log request completed
          logger.info('Request completed', {
            context: 'LoggingInterceptor',
            requestId,
            data: {
              method,
              path: url,
              statusCode: response.statusCode,
              durationMs,
            },
          });
        },
        error: (error) => {
          const durationMs = Date.now() - startTime;

          // Log request error
          logger.error('Request failed', {
            context: 'LoggingInterceptor',
            requestId,
            data: {
              method,
              path: url,
              statusCode: error.status || 500,
              durationMs,
            },
            error: {
              message: error.message,
              name: error.name,
            },
          });
        },
      }),
    );
  }
}

Reflect.decorate([Injectable()], LoggingInterceptor);

module.exports = { LoggingInterceptor };
