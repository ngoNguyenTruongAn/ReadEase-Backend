/**
 * HTTP Exception Filter
 *
 * Catches all NestJS HttpException (400, 401, 403, 404, 409, etc.)
 * and formats them into the standard error response envelope:
 *
 * {
 *   success: false,
 *   error: { code, message, details, timestamp, path }
 * }
 *
 * In development: includes stack trace.
 * In production: hides stack trace, generic message for 500s.
 */
const { Catch, HttpException } = require('@nestjs/common');
const { logger } = require('../logger/winston.config');

/**
 * Maps HTTP status to error code string
 * @param {number} status
 * @returns {string}
 */
function getErrorCode(status) {
  const codeMap = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'TOO_MANY_REQUESTS',
  };
  return codeMap[status] || 'HTTP_ERROR';
}

class HttpExceptionFilter {
  /**
   * @param {HttpException} exception
   * @param {import('@nestjs/common').ArgumentsHost} host
   */
  catch(exception, host) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Extract details from NestJS validation errors
    const details =
      typeof exceptionResponse === 'object' && exceptionResponse.message
        ? Array.isArray(exceptionResponse.message)
          ? exceptionResponse.message
          : [exceptionResponse.message]
        : [exception.message];

    const errorBody = {
      success: false,
      error: {
        code: getErrorCode(status),
        message:
          typeof exceptionResponse === 'string'
            ? exceptionResponse
            : exceptionResponse.error || exception.message,
        details,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    };

    // Add stack trace in development only
    if (process.env.APP_ENV !== 'production') {
      errorBody.error.stack = exception.stack;
    }

    // Log the error
    logger.warn('HTTP exception', {
      context: 'HttpExceptionFilter',
      requestId: request.requestId,
      data: {
        status,
        code: errorBody.error.code,
        message: exception.message,
        path: request.url,
        method: request.method,
      },
    });

    response.status(status).json(errorBody);
  }
}

Reflect.decorate([Catch(HttpException)], HttpExceptionFilter);

module.exports = { HttpExceptionFilter };
