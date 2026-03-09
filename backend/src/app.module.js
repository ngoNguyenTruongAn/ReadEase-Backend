const { Module } = require('@nestjs/common');
const { APP_INTERCEPTOR } = require('@nestjs/core');
const { ConfigModule } = require('@nestjs/config');
const { AppController } = require('./app.controller');
const { AppService } = require('./app.service');
const { configModules, validationSchema, validationOptions } = require('./config');
const { LoggingInterceptor } = require('./common/interceptors/logging.interceptor');
const { requestIdMiddleware } = require('./common/middleware/request-id.middleware');
const { HealthModule } = require('./modules/health/health.module');

/** @type {import('@nestjs/common').ModuleMetadata} */
const metadata = {
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configModules,
      validationSchema,
      validationOptions,
      envFilePath: ['.env', '../.env'],
    }),
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
};

class AppModule {
  /**
   * Apply request-id middleware to all routes
   * @param {MiddlewareConsumer} consumer
   */
  configure(consumer) {
    consumer.apply(requestIdMiddleware).forRoutes('*');
  }
}

Reflect.decorate([Module(metadata)], AppModule);

module.exports = { AppModule };
