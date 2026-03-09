const { NestFactory } = require('@nestjs/core');
const { ConfigService } = require('@nestjs/config');
const { AppModule } = require('./app.module');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get('app.port', 3000);
  const env = configService.get('app.env', 'development');

  await app.listen(port);

  console.log(`ReadEase Backend is running on: http://localhost:${port}`);
  console.log(`Environment: ${env}`);
}

bootstrap();
