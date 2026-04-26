const {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} = require('@nestjs/common');

const bcrypt = require('bcrypt');
const { JwtService } = require('@nestjs/jwt');
const { InjectRepository } = require('@nestjs/typeorm');

const { UserEntity } = require('../users/entities/user.entity');
const { OtpService } = require('./services/otp.service');
const { EmailService } = require('./services/email.service');
const { logger } = require('../../common/logger/winston.config');

class AuthService {
  constructor(userRepository, jwtService, otpService, emailService) {
    this.userRepository = userRepository;
    this.jwtService = jwtService;
    this.otpService = otpService;
    this.emailService = emailService;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // REGISTER — create pending user + send OTP email
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async register(dto) {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existing && existing.email_verified) {
      throw new ConflictException('This email is already registered');
    }

    // If user exists but not verified, delete old and re-register
    if (existing && !existing.email_verified) {
      await this.userRepository.remove(existing);
    }

    const password_hash = await bcrypt.hash(dto.password, 12);

    const user = this.userRepository.create({
      email: dto.email,
      password_hash,
      display_name: dto.display_name || dto.displayName,
      role: dto.role || null, // null default instead of ROLE_GUARDIAN before verified
      email_verified: false,
      is_active: false,
    });

    await this.userRepository.save(user);

    // Generate and send OTP
    const code = await this.otpService.createOTP(user.id, 'EMAIL_VERIFY');
    await this.emailService.sendOTP(user.email, code, 'EMAIL_VERIFY');

    logger.info('User registered, OTP sent', {
      context: 'AuthService',
      data: { userId: user.id, email: user.email },
    });

    return {
      message: 'Registration successful! Please check your email for the verification code.',
      email: user.email,
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VERIFY EMAIL — verify OTP + activate account
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async verifyEmail(dto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new NotFoundException('No account found with this email');
    }

    if (user.email_verified) {
      throw new BadRequestException('Email has already been verified');
    }

    // Verify OTP
    await this.otpService.verifyOTP(user.id, dto.code, 'EMAIL_VERIFY');

    // Activate account
    user.email_verified = true;

    let inviteCode = null;
    if (user.role === 'ROLE_CHILD' && !user.is_active) {
      const crypto = require('crypto');
      inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      user.is_active = false; // Must be activated by Guardian
      user.guardian_invite_code = inviteCode;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      user.guardian_invite_code_expires_at = expiresAt;
    } else {
      user.is_active = true;
    }

    await this.userRepository.save(user);

    // Generate tokens
    const tokens = this.generateTokens(user);

    logger.info('Email verified', {
      context: 'AuthService',
      data: { userId: user.id, email: user.email },
    });

    return {
      message: 'Email verified successfully!',
      ...tokens,
      ...(inviteCode && { inviteCode }), // Include for frontend to display
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RESEND OTP
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async resendOTP(dto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new NotFoundException('No account found with this email');
    }

    if (user.email_verified) {
      throw new BadRequestException('Email has already been verified');
    }

    const code = await this.otpService.createOTP(user.id, 'EMAIL_VERIFY');
    await this.emailService.sendOTP(user.email, code, 'EMAIL_VERIFY');

    return {
      message: 'OTP has been resent. Please check your email.',
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SET ROLE — after email verified
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async setRole(userId, dto) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Account not found');
    }

    user.role = dto.role;
    await this.userRepository.save(user);

    // Re-generate tokens with new role
    const tokens = this.generateTokens(user);

    logger.info('Role updated', {
      context: 'AuthService',
      data: { userId: user.id, role: dto.role },
    });

    return {
      message: `Role updated: ${dto.role}`,
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // LOGIN — check email_verified + is_active
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async login(dto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.email_verified) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Account has been deactivated');
    }

    const match = await bcrypt.compare(dto.password, user.password_hash);

    if (!match) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Update last_login_at
    user.last_login_at = new Date();
    await this.userRepository.save(user);

    const tokens = this.generateTokens(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FORGOT PASSWORD — send OTP to email
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async forgotPassword(dto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      // Don't reveal that email doesn't exist (security)
      return {
        message: 'If the email exists, an OTP has been sent.',
      };
    }

    const code = await this.otpService.createOTP(user.id, 'FORGOT_PASSWORD');
    await this.emailService.sendOTP(user.email, code, 'FORGOT_PASSWORD');

    logger.info('Forgot password OTP sent', {
      context: 'AuthService',
      data: { userId: user.id },
    });

    return {
      message: 'OTP has been sent to your email.',
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RESET PASSWORD — verify OTP + set new password
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async resetPassword(dto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new NotFoundException('No account found with this email');
    }

    // Verify OTP
    await this.otpService.verifyOTP(user.id, dto.code, 'FORGOT_PASSWORD');

    // Hash new password
    user.password_hash = await bcrypt.hash(dto.newPassword, 12);
    await this.userRepository.save(user);

    logger.info('Password reset successful', {
      context: 'AuthService',
      data: { userId: user.id },
    });

    return {
      message: 'Password reset successful! Please log in.',
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CHANGE PASSWORD — verify old password + set new
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async changePassword(userId, dto) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Account not found');
    }

    // Verify old password
    const match = await bcrypt.compare(dto.oldPassword, user.password_hash);

    if (!match) {
      throw new BadRequestException('Old password is incorrect');
    }

    if (dto.oldPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from old password');
    }

    // Hash new password
    user.password_hash = await bcrypt.hash(dto.newPassword, 12);
    await this.userRepository.save(user);

    logger.info('Password changed', {
      context: 'AuthService',
      data: { userId: user.id },
    });

    return {
      message: 'Password changed successfully!',
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // REFRESH TOKEN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async refresh(dto) {
    try {
      const payload = this.jwtService.verify(dto.refreshToken);

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException();
      }

      const accessToken = this.jwtService.sign(
        { sub: user.id, email: user.email, role: user.role },
        { expiresIn: '15m' },
      );

      return { accessToken };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getProfile(userId) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'role', 'display_name', 'email_verified', 'is_active', 'created_at'],
    });

    if (!user) {
      throw new NotFoundException('Account not found');
    }

    return user;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HELPER — generate access + refresh tokens
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  generateTokens(user) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }
}

/**
 * Dependency Injection
 */
InjectRepository(UserEntity)(AuthService, undefined, 0);
require('@nestjs/common').Inject(JwtService)(AuthService, undefined, 1);
require('@nestjs/common').Inject(OtpService)(AuthService, undefined, 2);
require('@nestjs/common').Inject(EmailService)(AuthService, undefined, 3);
Injectable()(AuthService);

module.exports = { AuthService };
