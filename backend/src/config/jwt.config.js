/**
 * JWT authentication configuration
 * Validates: JWT_SECRET (required), JWT_ACCESS_TTL, JWT_REFRESH_TTL
 */
const Joi = require('joi');

const JWT_SCHEMA = {
  // minimum 16 characters, if less than 16 character then app will crash
  JWT_SECRET: Joi.string().required().min(16).description('JWT signing secret (min 16 chars)'),
  // default 15 minutes
  JWT_ACCESS_TTL: Joi.number()
    .default(900)
    .description('Access token TTL in seconds (default 15min)'),
  // default 7 days
  JWT_REFRESH_TTL: Joi.number()
    .default(604800)
    .description('Refresh token TTL in seconds (default 7d)'),
};

const jwtConfig = () => ({
  jwt: {
    secret: process.env.JWT_SECRET,
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL, 10) || 900,
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL, 10) || 604800,
  },
});

module.exports = { jwtConfig, JWT_SCHEMA };
