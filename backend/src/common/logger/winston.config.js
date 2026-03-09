/**
 * Winston Logger Configuration
 *
 * Structured JSON logging following ReadEase logging standards:
 * - timestamp, level, service, context, requestId, data
 * - Development: colorized console
 * - Production: pure JSON
 *
 * NEVER logs: passwords, JWT tokens, API keys, child PII
 */
const winston = require('winston');

/**
 * Create Winston logger instance
 * @param {string} [level] - Log level override (default from LOG_LEVEL env)
 * @returns {winston.Logger}
 */
function createWinstonLogger(level) {
  const logLevel = level || process.env.LOG_LEVEL || 'info';
  const isProduction = process.env.APP_ENV === 'production';

  // Base format: timestamp + errors with stack + JSON
  const baseFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
  );

  // Production: pure JSON output
  const productionFormat = winston.format.combine(baseFormat, winston.format.json());

  // Development: colorized, readable
  const developmentFormat = winston.format.combine(
    baseFormat,
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, context, requestId, data, stack }) => {
      const ctx = context ? `[${context}]` : '';
      const rid = requestId ? `(${requestId})` : '';
      const extra = data ? ` ${JSON.stringify(data)}` : '';
      const errStack = stack ? `\n${stack}` : '';
      return `${timestamp} ${level} ${ctx} ${rid} ${message}${extra}${errStack}`;
    }),
  );

  const logger = winston.createLogger({
    level: logLevel,
    format: isProduction ? productionFormat : developmentFormat,
    defaultMeta: { service: 'readease-api' },
    transports: [new winston.transports.Console()],
  });

  return logger;
}

// Create singleton logger instance
const logger = createWinstonLogger();

module.exports = { logger, createWinstonLogger };
