const { Controller, Get, Dependencies } = require('@nestjs/common');
const { AppService } = require('./app.service');

class AppController {
  /** @param {AppService} appService */
  constructor(appService) {
    this.appService = appService;
  }

  getHealth() {
    return this.appService.getHealth();
  }
}

// NestJS decorators applied via Reflect (JavaScript — no TS decorator syntax)
Reflect.decorate([Dependencies(AppService), Controller()], AppController);
Reflect.decorate(
  [Get()],
  AppController.prototype,
  'getHealth',
  Object.getOwnPropertyDescriptor(AppController.prototype, 'getHealth'),
);

module.exports = { AppController };
