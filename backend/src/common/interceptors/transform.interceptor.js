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
        let message = undefined;
        let data = responseData;
        let meta = { timestamp: new Date().toISOString() };

        if (responseData && typeof responseData === 'object') {
          // Extract message if present
          if (responseData.message) {
            message = responseData.message;
          }

          // If response is the new structured format { message, data } OR { data, meta }
          if (responseData.data !== undefined) {
            data = responseData.data;
          } else if (responseData.message && Object.keys(responseData).length === 1) {
            // If the controller only returned { message }, then data can be null
            data = null;
          } else if (responseData.message) {
            // If there's a message and other fields, just keep the data as is (minus the message maybe? For safely, let's keep it as is, or remove message)
            const { message: _, ...rest } = responseData;
            data = rest;
          }

          // Extract meta if present
          if (responseData.meta !== undefined) {
            meta = {
              ...responseData.meta,
              ...meta,
            };
          }
        }

        return {
          success: true,
          ...(message && { message }),
          data,
          meta,
        };
      }),
    );
  }
}

Reflect.decorate([Injectable()], TransformInterceptor);

module.exports = { TransformInterceptor };
