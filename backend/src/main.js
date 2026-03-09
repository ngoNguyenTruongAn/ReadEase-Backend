const { NestFactory } = require('@nestjs/core');
const { ConfigService } = require('@nestjs/config');
const { AppModule } = require('./app.module');
const { logger } = require('./common/logger/winston.config');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Suppress default NestJS logger — Winston handles everything
    logger: false,
  });

  const configService = app.get(ConfigService);
  const port = configService.get('app.port', 3000);
  const env = configService.get('app.env', 'development');

  await app.listen(port);

  logger.info('Application started', {
    context: 'Bootstrap',
    data: { port, env },
  });
}

bootstrap();
