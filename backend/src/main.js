const { NestFactory } = require('@nestjs/core');
const { ConfigService } = require('@nestjs/config');
const { AppModule } = require('./app.module');
const { logger } = require('./common/logger/winston.config');
const { HttpExceptionFilter } = require('./common/filters/http-exception.filter');
const { AllExceptionsFilter } = require('./common/filters/all-exceptions.filter');
const { TransformInterceptor } = require('./common/interceptors/transform.interceptor');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get('app.port', 3000);
  const env = configService.get('app.env', 'development');

  // Global filters — order matters: AllExceptions first (catch-all), then HttpException
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());

  // Global interceptors — TransformInterceptor wraps success responses
  app.useGlobalInterceptors(new TransformInterceptor());

  await app.listen(port);

  logger.info('Application started', {
    context: 'Bootstrap',
    data: { port, env },
  });
}

bootstrap();
