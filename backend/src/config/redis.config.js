/**
 * Redis configuration
 * Validates: REDIS_HOST (required), REDIS_PORT
 */
const Joi = require('joi');

const REDIS_SCHEMA = {
  REDIS_HOST: Joi.string().optional().allow('').description('Redis host'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_URL: Joi.string().optional().allow('').description('Redis connection URL'),
  REDIS_PASSWORD: Joi.string().optional().allow('').description('Redis password'),
  REDIS_TLS: Joi.boolean().optional().default(false).description('Enable Redis TLS'),
};

const redisConfig = () => ({
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    url: process.env.REDIS_URL || '',
    password: process.env.REDIS_PASSWORD || '',
    tls: process.env.REDIS_TLS === 'true' || process.env.REDIS_TLS === '1',
  },
});

module.exports = { redisConfig, REDIS_SCHEMA };
