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
      throw new ConflictException('Email này đã được đăng ký');
    }

    // If user exists but not verified, delete old and re-register
    if (existing && !existing.email_verified) {
      await this.userRepository.remove(existing);
    }

    const password_hash = await bcrypt.hash(dto.password, 12);

    const user = this.userRepository.create({
      email: dto.email,
      password_hash,
      display_name: dto.displayName,
      role: 'ROLE_GUARDIAN', // default, will be set after verify
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
      message: 'Đăng ký thành công! Vui lòng kiểm tra email để lấy mã xác thực.',
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
      throw new NotFoundException('Không tìm thấy tài khoản với email này');
    }

    if (user.email_verified) {
      throw new BadRequestException('Email đã được xác thực trước đó');
    }

    // Verify OTP
    await this.otpService.verifyOTP(user.id, dto.code, 'EMAIL_VERIFY');

    // Activate account
    user.email_verified = true;
    user.is_active = true;
    await this.userRepository.save(user);

    // Generate tokens
    const tokens = this.generateTokens(user);

    logger.info('Email verified', {
      context: 'AuthService',
      data: { userId: user.id, email: user.email },
    });

    return {
      message: 'Xác thực email thành công!',
      ...tokens,
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
      throw new NotFoundException('Không tìm thấy tài khoản với email này');
    }

    if (user.email_verified) {
      throw new BadRequestException('Email đã được xác thực');
    }

    const code = await this.otpService.createOTP(user.id, 'EMAIL_VERIFY');
    await this.emailService.sendOTP(user.email, code, 'EMAIL_VERIFY');

    return {
      message: 'Đã gửi lại mã OTP. Vui lòng kiểm tra email.',
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
      throw new NotFoundException('Không tìm thấy tài khoản');
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
      message: `Đã cập nhật vai trò: ${dto.role}`,
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
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    if (!user.email_verified) {
      throw new UnauthorizedException('Vui lòng xác thực email trước khi đăng nhập');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa');
    }

    const match = await bcrypt.compare(dto.password, user.password_hash);

    if (!match) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
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
        message: 'Nếu email tồn tại, mã OTP đã được gửi.',
      };
    }

    const code = await this.otpService.createOTP(user.id, 'FORGOT_PASSWORD');
    await this.emailService.sendOTP(user.email, code, 'FORGOT_PASSWORD');

    logger.info('Forgot password OTP sent', {
      context: 'AuthService',
      data: { userId: user.id },
    });

    return {
      message: 'Mã OTP đã được gửi đến email của bạn.',
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
      throw new NotFoundException('Không tìm thấy tài khoản với email này');
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
      message: 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập.',
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
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    // Verify old password
    const match = await bcrypt.compare(dto.oldPassword, user.password_hash);

    if (!match) {
      throw new BadRequestException('Mật khẩu cũ không đúng');
    }

    // Hash new password
    user.password_hash = await bcrypt.hash(dto.newPassword, 12);
    await this.userRepository.save(user);

    logger.info('Password changed', {
      context: 'AuthService',
      data: { userId: user.id },
    });

    return {
      message: 'Đổi mật khẩu thành công!',
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
