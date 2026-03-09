/**
 * Database configuration
 * Will be fully implemented in TASK-003 (Environment Configuration)
 */
const databaseConfig = () => ({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'readease',
  username: process.env.DB_USER || 'readease_app',
  password: process.env.DB_PASSWORD || '',
  synchronize: false,
  logging: process.env.APP_ENV === 'development',
});

module.exports = { databaseConfig };
