/**
 * Redis configuration
 * Will be fully implemented in TASK-003 (Environment Configuration)
 */
const redisConfig = () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
});

module.exports = { redisConfig };
