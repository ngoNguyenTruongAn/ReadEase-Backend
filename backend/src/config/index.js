/**
 * Configuration Index — Aggregates all config modules
 *
 * Exports:
 *   - configModules: Array of config factory functions for ConfigModule.forRoot()
 *   - validationSchema: Joi schema that validates ALL required env vars
 *   - validationOptions: Options for fail-fast behavior
 */
const Joi = require('joi');
const { appConfig, APP_SCHEMA } = require('./app.config');
const { databaseConfig, DATABASE_SCHEMA } = require('./database.config');
const { redisConfig, REDIS_SCHEMA } = require('./redis.config');
const { jwtConfig, JWT_SCHEMA } = require('./jwt.config');

/**
 * ML Engine schema — separate since it's optional in dev
 */
const ML_SCHEMA = {
  ML_ENGINE_URL: Joi.string().uri().default('http://localhost:8000'),
  ML_TIMEOUT_MS: Joi.number().default(5000),
};

/**
 * Gemini AI schema — optional, only needed for lexical/reports features
 */
const GEMINI_SCHEMA = {
  GEMINI_API_KEY: Joi.string().optional().allow('').default(''),
  GEMINI_MODEL: Joi.string().default('gemini-2.0-flash'),
};

/**
 * Combined Joi validation schema for ALL environment variables
 * App will CRASH on startup if required vars are missing.
 */
const validationSchema = Joi.object({
  ...APP_SCHEMA,
  ...DATABASE_SCHEMA,
  ...REDIS_SCHEMA,
  ...JWT_SCHEMA,
  ...ML_SCHEMA,
  ...GEMINI_SCHEMA,
});

/**
 * Validation options — fail fast, allow unknown env vars
 */
const validationOptions = {
  allowUnknown: true,
  abortEarly: false,
};

/**
 * ML Engine config factory
 */
const mlEngineConfig = () => ({
  mlEngine: {
    url: process.env.ML_ENGINE_URL || 'http://localhost:8000',
    timeoutMs: parseInt(process.env.ML_TIMEOUT_MS, 10) || 5000,
  },
});

/**
 * Gemini AI config factory
 */
const geminiConfig = () => ({
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  },
});

/**
 * All config factory functions to load into ConfigModule
 */
const configModules = [
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
  mlEngineConfig,
  geminiConfig,
];

module.exports = {
  configModules,
  validationSchema,
  validationOptions,
  // Re-export individual configs for direct imports
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
  mlEngineConfig,
  geminiConfig,
};
