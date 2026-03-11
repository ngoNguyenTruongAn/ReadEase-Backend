require('reflect-metadata');

const { Controller, Post, Body, BadRequestException, Inject } = require('@nestjs/common');
const { AuthService } = require('./auth.service');

const RegisterDto = require('./dto/register.dto');
const LoginDto = require('./dto/login.dto');
const RefreshTokenDto = require('./dto/refresh-token.dto');

class AuthController {
  constructor(authService) {
    this.authService = authService;
  }

  async register(body) {
    const { error, value } = RegisterDto.schema.validate(body);

    if (error) {
      throw new BadRequestException(error.details[0].message);
    }

    return this.authService.register(value);
  }

  async login(body) {
    const { error, value } = LoginDto.schema.validate(body);

    if (error) {
      throw new BadRequestException(error.details[0].message);
    }

    return this.authService.login(value);
  }

  async refresh(body) {
    const { error, value } = RefreshTokenDto.schema.validate(body);

    if (error) {
      throw new BadRequestException(error.details[0].message);
    }

    return this.authService.refresh(value);
  }
}

Controller('auth')(AuthController);

Inject(AuthService)(AuthController, undefined, 0);

Post('register')(
  AuthController.prototype,
  'register',
  Object.getOwnPropertyDescriptor(AuthController.prototype, 'register'),
);

Body()(AuthController.prototype, 'register', 0);

Post('login')(
  AuthController.prototype,
  'login',
  Object.getOwnPropertyDescriptor(AuthController.prototype, 'login'),
);

Body()(AuthController.prototype, 'login', 0);

Post('refresh')(
  AuthController.prototype,
  'refresh',
  Object.getOwnPropertyDescriptor(AuthController.prototype, 'refresh'),
);

Body()(AuthController.prototype, 'refresh', 0);

module.exports = { AuthController };
