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
  HttpCode,
  BadRequestException,
  Inject,
} = require('@nestjs/common');
const { AuthService } = require('./auth.service');
const { JwtAuthGuard } = require('./guards/jwt-auth.guard');
const { RefreshAuthGuard } = require('./guards/refresh-auth.guard');
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
    return this.authService.getProfile(req.user.sub);
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

// ── POST /auth/register (Public) → 201 Created ──
const registerDescriptor = Object.getOwnPropertyDescriptor(AuthController.prototype, 'register');
Reflect.decorate(
  [Post('register'), HttpCode(201)],
  AuthController.prototype,
  'register',
  registerDescriptor,
);
Body()(AuthController.prototype, 'register', 0);

// ── POST /auth/verify-email (Public) → 200 OK ──
const verifyEmailDescriptor = Object.getOwnPropertyDescriptor(
  AuthController.prototype,
  'verifyEmail',
);
Reflect.decorate(
  [Post('verify-email'), HttpCode(200)],
  AuthController.prototype,
  'verifyEmail',
  verifyEmailDescriptor,
);
Body()(AuthController.prototype, 'verifyEmail', 0);

// ── POST /auth/resend-otp (Public) → 200 OK ──
const resendOtpDescriptor = Object.getOwnPropertyDescriptor(AuthController.prototype, 'resendOtp');
Reflect.decorate(
  [Post('resend-otp'), HttpCode(200)],
  AuthController.prototype,
  'resendOtp',
  resendOtpDescriptor,
);
Body()(AuthController.prototype, 'resendOtp', 0);

// ── POST /auth/set-role (Protected: JwtAuthGuard) → 200 OK ──
const setRoleDescriptor = Object.getOwnPropertyDescriptor(AuthController.prototype, 'setRole');
Reflect.decorate(
  [Post('set-role'), HttpCode(200), UseGuards(JwtAuthGuard)],
  AuthController.prototype,
  'setRole',
  setRoleDescriptor,
);
Req()(AuthController.prototype, 'setRole', 0);
Body()(AuthController.prototype, 'setRole', 1);

// ── POST /auth/login (Public) → 200 OK ──
const loginDescriptor = Object.getOwnPropertyDescriptor(AuthController.prototype, 'login');
Reflect.decorate(
  [Post('login'), HttpCode(200)],
  AuthController.prototype,
  'login',
  loginDescriptor,
);
Body()(AuthController.prototype, 'login', 0);

// ── POST /auth/refresh (Protected: JwtAuthGuard) → 200 OK ──
const refreshDescriptor = Object.getOwnPropertyDescriptor(AuthController.prototype, 'refresh');
Reflect.decorate(
  [Post('refresh'), HttpCode(200), UseGuards(RefreshAuthGuard)],
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

// ── POST /auth/forgot-password (Public) → 200 OK ──
const forgotPasswordDescriptor = Object.getOwnPropertyDescriptor(
  AuthController.prototype,
  'forgotPassword',
);
Reflect.decorate(
  [Post('forgot-password'), HttpCode(200)],
  AuthController.prototype,
  'forgotPassword',
  forgotPasswordDescriptor,
);
Body()(AuthController.prototype, 'forgotPassword', 0);

// ── POST /auth/reset-password (Public) → 200 OK ──
const resetPasswordDescriptor = Object.getOwnPropertyDescriptor(
  AuthController.prototype,
  'resetPassword',
);
Reflect.decorate(
  [Post('reset-password'), HttpCode(200)],
  AuthController.prototype,
  'resetPassword',
  resetPasswordDescriptor,
);
Body()(AuthController.prototype, 'resetPassword', 0);

// ── POST /auth/change-password (Protected: JwtAuthGuard) ──
const changePasswordDescriptor = Object.getOwnPropertyDescriptor(
  AuthController.prototype,
  'changePassword',
);
Reflect.decorate(
  [Post('change-password'), HttpCode(200), UseGuards(JwtAuthGuard)],
  AuthController.prototype,
  'changePassword',
  changePasswordDescriptor,
);
Req()(AuthController.prototype, 'changePassword', 0);
Body()(AuthController.prototype, 'changePassword', 1);

module.exports = { AuthController };
