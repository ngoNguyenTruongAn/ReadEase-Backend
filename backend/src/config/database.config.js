/**
 * PostgreSQL database configuration
 * Validates: DB_HOST (required), DB_PORT, DB_NAME, DB_USER, DB_PASSWORD (required)
 */
const Joi = require('joi');

const DATABASE_SCHEMA = {
  DB_HOST: Joi.string().required().description('PostgreSQL host'),
  DB_PORT: Joi.number().default(5432),
  DB_NAME: Joi.string().default('readease'),
  DB_USER: Joi.string().default('readease_app'),
  DB_PASSWORD: Joi.string().required().description('PostgreSQL password'),
};

const databaseConfig = () => ({
  database: {
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'readease',
    username: process.env.DB_USER || 'readease_app',
    password: process.env.DB_PASSWORD,
    synchronize: false,
    logging: process.env.APP_ENV === 'development',
  },
});

module.exports = { databaseConfig, DATABASE_SCHEMA };
