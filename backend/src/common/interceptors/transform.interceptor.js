/**
 * Transform Interceptor
 *
 * Wraps ALL successful controller responses into the standard envelope:
 *
 * {
 *   success: true,
 *   data: <controller return value>,
 *   meta: { timestamp }
 * }
 *
 * If controller returns an object with { data, meta } shape,
 * it will be used directly (for paginated responses).
 */
const { Injectable } = require('@nestjs/common');
const { map } = require('rxjs/operators');

class TransformInterceptor {
  /**
   * @param {import('@nestjs/common').ExecutionContext} context
   * @param {import('@nestjs/common').CallHandler} next
   */
  intercept(context, next) {
    return next.handle().pipe(
      map((responseData) => {
        // If response already has { data, meta } shape (paginated), use it
        if (responseData && responseData.data !== undefined && responseData.meta !== undefined) {
          return {
            success: true,
            data: responseData.data,
            meta: {
              ...responseData.meta,
              timestamp: new Date().toISOString(),
            },
          };
        }

        // Otherwise wrap the raw data
        return {
          success: true,
          data: responseData,
          meta: {
            timestamp: new Date().toISOString(),
          },
        };
      }),
    );
  }
}

Reflect.decorate([Injectable()], TransformInterceptor);

module.exports = { TransformInterceptor };
