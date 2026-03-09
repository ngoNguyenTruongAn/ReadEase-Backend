/**
 * Application configuration
 * Validates: APP_PORT, APP_ENV, LOG_LEVEL
 */
const Joi = require('joi');

const APP_SCHEMA = {
  APP_PORT: Joi.number().default(3000),
  APP_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'verbose').default('debug'),
};

const appConfig = () => ({
  app: {
    port: parseInt(process.env.APP_PORT, 10) || 3000,
    env: process.env.APP_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'debug',
    isProduction: process.env.APP_ENV === 'production',
  },
});

module.exports = { appConfig, APP_SCHEMA };
