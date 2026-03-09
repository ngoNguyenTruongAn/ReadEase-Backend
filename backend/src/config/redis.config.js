/**
 * Redis configuration
 * Validates: REDIS_HOST (required), REDIS_PORT
 */
const Joi = require('joi');

const REDIS_SCHEMA = {
  REDIS_HOST: Joi.string().required().description('Redis host'),
  REDIS_PORT: Joi.number().default(6379),
};

const redisConfig = () => ({
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  },
});

module.exports = { redisConfig, REDIS_SCHEMA };
