/**
 * Auth Controller
 *
 * POST /auth/register         — Public, creates pending user + sends OTP
 * POST /auth/verify-email     — Public, verifies OTP + activates account
 * POST /auth/resend-otp       — Public, resends OTP email
 * POST /auth/set-role         — Protected, sets user role after verification
 * POST /auth/login            — Public, returns JWT tokens
 * POST /auth/refresh          — Protected, refreshes access token
 * GET  /auth/profile          — Protected, returns current user info
 * POST /auth/forgot-password  — Public, sends password reset OTP
 * POST /auth/reset-password   — Public, resets password with OTP
 * POST /auth/change-password  — Protected, changes password with old password
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
const VerifyEmailDto = require('./dto/verify-email.dto');
const ResendOtpDto = require('./dto/resend-otp.dto');
const SetRoleDto = require('./dto/set-role.dto');
const ForgotPasswordDto = require('./dto/forgot-password.dto');
const ResetPasswordDto = require('./dto/reset-password.dto');
const ChangePasswordDto = require('./dto/change-password.dto');

class AuthController {
  /**
   * @param {AuthService} authService
   */
  constructor(authService) {
    this.authService = authService;
  }

  // ── POST /auth/register (Public) ──
  async register(body) {
    const { error, value } = RegisterDto.schema.validate(body);
    if (error) throw new BadRequestException(error.details[0].message);
    return this.authService.register(value);
  }

  // ── POST /auth/verify-email (Public) ──
  async verifyEmail(body) {
    const { error, value } = VerifyEmailDto.schema.validate(body);
    if (error) throw new BadRequestException(error.details[0].message);
    return this.authService.verifyEmail(value);
  }

  // ── POST /auth/resend-otp (Public) ──
  async resendOtp(body) {
    const { error, value } = ResendOtpDto.schema.validate(body);
    if (error) throw new BadRequestException(error.details[0].message);
    return this.authService.resendOTP(value);
  }

  // ── POST /auth/set-role (Protected: JwtAuthGuard) ──
  async setRole(req, body) {
    const { error, value } = SetRoleDto.schema.validate(body);
    if (error) throw new BadRequestException(error.details[0].message);
    return this.authService.setRole(req.user.sub, value);
  }

  // ── POST /auth/login (Public) ──
  async login(body) {
    const { error, value } = LoginDto.schema.validate(body);
    if (error) throw new BadRequestException(error.details[0].message);
    return this.authService.login(value);
  }

  // ── POST /auth/refresh (Protected: JwtAuthGuard) ──
  async refresh(body) {
    const { error, value } = RefreshTokenDto.schema.validate(body);
    if (error) throw new BadRequestException(error.details[0].message);
    return this.authService.refresh(value);
  }

  // ── GET /auth/profile (Protected: JwtAuthGuard + RolesGuard) ──
  async getProfile(req) {
    return {
      id: req.user.sub,
      email: req.user.email,
      role: req.user.role,
    };
  }

  // ── POST /auth/forgot-password (Public) ──
  async forgotPassword(body) {
    const { error, value } = ForgotPasswordDto.schema.validate(body);
    if (error) throw new BadRequestException(error.details[0].message);
    return this.authService.forgotPassword(value);
  }

  // ── POST /auth/reset-password (Public) ──
  async resetPassword(body) {
    const { error, value } = ResetPasswordDto.schema.validate(body);
    if (error) throw new BadRequestException(error.details[0].message);
    return this.authService.resetPassword(value);
  }

  // ── POST /auth/change-password (Protected: JwtAuthGuard) ──
  async changePassword(req, body) {
    const { error, value } = ChangePasswordDto.schema.validate(body);
    if (error) throw new BadRequestException(error.details[0].message);
    return this.authService.changePassword(req.user.sub, value);
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

// ── POST /auth/verify-email (Public) ──
Post('verify-email')(
  AuthController.prototype,
  'verifyEmail',
  Object.getOwnPropertyDescriptor(AuthController.prototype, 'verifyEmail'),
);
Body()(AuthController.prototype, 'verifyEmail', 0);

// ── POST /auth/resend-otp (Public) ──
Post('resend-otp')(
  AuthController.prototype,
  'resendOtp',
  Object.getOwnPropertyDescriptor(AuthController.prototype, 'resendOtp'),
);
Body()(AuthController.prototype, 'resendOtp', 0);

// ── POST /auth/set-role (Protected: JwtAuthGuard) ──
const setRoleDescriptor = Object.getOwnPropertyDescriptor(AuthController.prototype, 'setRole');
Reflect.decorate(
  [Post('set-role'), UseGuards(JwtAuthGuard)],
  AuthController.prototype,
  'setRole',
  setRoleDescriptor,
);
Req()(AuthController.prototype, 'setRole', 0);
Body()(AuthController.prototype, 'setRole', 1);

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

// ── POST /auth/forgot-password (Public) ──
Post('forgot-password')(
  AuthController.prototype,
  'forgotPassword',
  Object.getOwnPropertyDescriptor(AuthController.prototype, 'forgotPassword'),
);
Body()(AuthController.prototype, 'forgotPassword', 0);

// ── POST /auth/reset-password (Public) ──
Post('reset-password')(
  AuthController.prototype,
  'resetPassword',
  Object.getOwnPropertyDescriptor(AuthController.prototype, 'resetPassword'),
);
Body()(AuthController.prototype, 'resetPassword', 0);

// ── POST /auth/change-password (Protected: JwtAuthGuard) ──
const changePasswordDescriptor = Object.getOwnPropertyDescriptor(
  AuthController.prototype,
  'changePassword',
);
Reflect.decorate(
  [Post('change-password'), UseGuards(JwtAuthGuard)],
  AuthController.prototype,
  'changePassword',
  changePasswordDescriptor,
);
Req()(AuthController.prototype, 'changePassword', 0);
Body()(AuthController.prototype, 'changePassword', 1);

module.exports = { AuthController };
