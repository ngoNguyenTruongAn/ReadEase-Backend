const { DataSource } = require('typeorm');
const path = require('path');

/**
 * TypeORM Data Source configuration for migrations CLI.
 * This file is used by: npx typeorm migration:run -d src/database/data-source.js
 *
 * For NestJS app integration, use TypeOrmModule.forRootAsync() in app.module.js
 */
const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  username: process.env.DB_USER || 'readease_app',
  password: process.env.DB_PASSWORD || 'devpassword',
  database: process.env.DB_NAME || 'readease',
  migrations: [path.join(__dirname, 'migrations', '*.js')],
  logging: process.env.APP_ENV === 'development',
});

module.exports = { AppDataSource };
