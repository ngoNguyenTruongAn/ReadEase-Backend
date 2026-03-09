const { Module } = require('@nestjs/common');
const { AppController } = require('./app.controller');
const { AppService } = require('./app.service');

/** @type {import('@nestjs/common').ModuleMetadata} */
const metadata = {
  imports: [],
  controllers: [AppController],
  providers: [AppService],
};

class AppModule {}

Reflect.decorate([Module(metadata)], AppModule);

module.exports = { AppModule };
