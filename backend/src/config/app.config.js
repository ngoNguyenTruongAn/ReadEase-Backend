/**
 * Application configuration
 * Loaded from environment variables and validated with Joi
 */
const appConfig = () => ({
  port: parseInt(process.env.APP_PORT, 10) || 3000,
  environment: process.env.APP_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'debug',
});

module.exports = { appConfig };
