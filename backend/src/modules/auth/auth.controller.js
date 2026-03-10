require('reflect-metadata')

const { Controller, Post, Body } = require('@nestjs/common')
const { AuthService } = require('./auth.service')

class AuthController {

  constructor(authService) {
    this.authService = authService
  }

  async register(body) {
    return this.authService.register(body)
  }

}

Controller('auth')(AuthController)

Post('register')(
  AuthController.prototype,
  'register',
  Object.getOwnPropertyDescriptor(AuthController.prototype, 'register')
)

Body()(AuthController.prototype, 'register', 0)

require('@nestjs/common').Inject(AuthService)(AuthController, null, 0)

module.exports = { AuthController }