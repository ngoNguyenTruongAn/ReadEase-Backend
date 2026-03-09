const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./app.module');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const port = process.env.APP_PORT || 3000;
  await app.listen(port);

  console.log(`🚀 ReadEase Backend is running on: http://localhost:${port}`);
}

bootstrap();
