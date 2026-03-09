const { Injectable } = require('@nestjs/common');

class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'ReadEase Backend',
      timestamp: new Date().toISOString(),
    };
  }
}

Reflect.decorate([Injectable()], AppService);

module.exports = { AppService };
