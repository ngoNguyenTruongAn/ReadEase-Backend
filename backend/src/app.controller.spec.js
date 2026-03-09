const { Test } = require('@nestjs/testing');
const { AppController } = require('./app.controller');
const { AppService } = require('./app.service');

describe('AppController', () => {
  let appController;

  beforeEach(async () => {
    const app = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get(AppController);
  });

  describe('getHealth', () => {
    it('should return health status', () => {
      const result = appController.getHealth();
      expect(result).toHaveProperty('status', 'ok');
      expect(result).toHaveProperty('service', 'ReadEase Backend');
      expect(result).toHaveProperty('timestamp');
    });
  });
});
