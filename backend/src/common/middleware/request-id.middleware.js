/**
 * Request ID Middleware
 *
 * Generates a unique requestId (UUID v4) for each incoming HTTP request.
 * Attaches it to req.requestId for downstream use by interceptors and services.
 */
const { randomUUID } = require('crypto');

/**
 * NestJS functional middleware that attaches a unique requestId
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requestIdMiddleware(req, res, next) {
  // Use existing X-Request-Id header or generate new one
  const requestId = req.headers['x-request-id'] || randomUUID();
  req.requestId = requestId;

  // Set response header so client can correlate
  res.setHeader('X-Request-Id', requestId);

  next();
}

module.exports = { requestIdMiddleware };
