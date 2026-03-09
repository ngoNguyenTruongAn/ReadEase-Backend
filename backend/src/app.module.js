const { Module } = require('@nestjs/common');
const { ConfigModule } = require('@nestjs/config');
const { AppController } = require('./app.controller');
const { AppService } = require('./app.service');
const { configModules, validationSchema, validationOptions } = require('./config');

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
  ],
  controllers: [AppController],
  providers: [AppService],
};

class AppModule {}

Reflect.decorate([Module(metadata)], AppModule);

module.exports = { AppModule };
