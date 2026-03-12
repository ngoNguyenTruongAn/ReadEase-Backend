/**
 * Auth Controller
 *
 * POST /auth/register — Public, creates a new user account
 * POST /auth/login    — Public, returns JWT tokens
 * POST /auth/refresh  — Protected, refreshes access token
 * GET  /auth/profile  — Protected, returns current user info
 */
require('reflect-metadata');

const {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  Inject,
} = require('@nestjs/common');
const { AuthService } = require('./auth.service');
const { JwtAuthGuard } = require('./guards/jwt-auth.guard');
const { RolesGuard } = require('./guards/roles.guard');
const { Roles } = require('./decorators/roles.decorator');

const RegisterDto = require('./dto/register.dto');
const LoginDto = require('./dto/login.dto');
const RefreshTokenDto = require('./dto/refresh-token.dto');

class AuthController {
  /**
   * @param {AuthService} authService
   */
  constructor(authService) {
    this.authService = authService;
  }

  /**
   * POST /auth/register — Public
   * @param {object} body - RegisterDto
   * @returns {Promise<{accessToken, refreshToken, user}>}
   */
  async register(body) {
    const { error, value } = RegisterDto.schema.validate(body);

    if (error) {
      throw new BadRequestException(error.details[0].message);
    }

    return this.authService.register(value);
  }

  /**
   * POST /auth/login — Public
   * @param {object} body - LoginDto
   * @returns {Promise<{accessToken, refreshToken, user}>}
   */
  async login(body) {
    const { error, value } = LoginDto.schema.validate(body);

    if (error) {
      throw new BadRequestException(error.details[0].message);
    }

    return this.authService.login(value);
  }

  /**
   * POST /auth/refresh — Protected (requires valid JWT)
   * @param {object} body - RefreshTokenDto
   * @returns {Promise<{accessToken}>}
   */
  async refresh(body) {
    const { error, value } = RefreshTokenDto.schema.validate(body);

    if (error) {
      throw new BadRequestException(error.details[0].message);
    }

    return this.authService.refresh(value);
  }

  /**
   * GET /auth/profile — Protected (requires valid JWT + any role)
   * @param {object} req - Express request with user from JWT
   * @returns {object} Current user info
   */
  async getProfile(req) {
    return {
      id: req.user.sub,
      email: req.user.email,
      role: req.user.role,
    };
  }
}

// ── Class decorators ──
Controller('api/v1/auth')(AuthController);
Inject(AuthService)(AuthController, undefined, 0);

// ── POST /auth/register (Public) ──
Post('register')(
  AuthController.prototype,
  'register',
  Object.getOwnPropertyDescriptor(AuthController.prototype, 'register'),
);
Body()(AuthController.prototype, 'register', 0);

// ── POST /auth/login (Public) ──
Post('login')(
  AuthController.prototype,
  'login',
  Object.getOwnPropertyDescriptor(AuthController.prototype, 'login'),
);
Body()(AuthController.prototype, 'login', 0);

// ── POST /auth/refresh (Protected: JwtAuthGuard) ──
const refreshDescriptor = Object.getOwnPropertyDescriptor(AuthController.prototype, 'refresh');
Reflect.decorate(
  [Post('refresh'), UseGuards(JwtAuthGuard)],
  AuthController.prototype,
  'refresh',
  refreshDescriptor,
);
Body()(AuthController.prototype, 'refresh', 0);

// ── GET /auth/profile (Protected: JwtAuthGuard + RolesGuard) ──
const profileDescriptor = Object.getOwnPropertyDescriptor(AuthController.prototype, 'getProfile');
Reflect.decorate(
  [
    Get('profile'),
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ROLE_CHILD', 'ROLE_CLINICIAN', 'ROLE_GUARDIAN'),
  ],
  AuthController.prototype,
  'getProfile',
  profileDescriptor,
);
Req()(AuthController.prototype, 'getProfile', 0);

module.exports = { AuthController };
