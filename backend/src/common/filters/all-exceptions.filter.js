/**
 * All Exceptions Filter (Catch-All)
 *
 * Catches ANY unhandled error that is NOT an HttpException:
 * - TypeError, ReferenceError, database errors, etc.
 * - Always returns 500 Internal Server Error
 *
 * In production: generic message, NO stack trace (security).
 * In development: includes original message + stack trace.
 */
const { Catch } = require('@nestjs/common');
const { logger } = require('../logger/winston.config');

class AllExceptionsFilter {
  /**
   * @param {Error} exception
   * @param {import('@nestjs/common').ArgumentsHost} host
   */
  catch(exception, host) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const isProduction = process.env.APP_ENV === 'production';

    // Log the full error (always, even in production)
    logger.error('Unhandled exception', {
      context: 'AllExceptionsFilter',
      requestId: request.requestId,
      data: {
        path: request.url,
        method: request.method,
      },
      error: {
        message: exception.message,
        name: exception.name,
        stack: exception.stack,
      },
    });

    const errorBody = {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: isProduction ? 'An unexpected error occurred' : exception.message,
        details: isProduction ? [] : [exception.message],
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    };

    // Add stack trace in development only
    if (!isProduction) {
      errorBody.error.stack = exception.stack;
    }

    response.status(500).json(errorBody);
  }
}

Reflect.decorate([Catch()], AllExceptionsFilter);

module.exports = { AllExceptionsFilter };
