/**
 * OTP Service
 *
 * Generates, stores, and verifies 6-digit OTP codes.
 * Uses TypeORM repository for otp_codes table.
 */
const { Injectable, BadRequestException } = require('@nestjs/common');
const { InjectRepository } = require('@nestjs/typeorm');
const { OtpCodeEntity } = require('../entities/otp-code.entity');
const { logger } = require('../../../common/logger/winston.config');

class OtpService {
  /**
   * @param {import('typeorm').Repository} otpRepository
   */
  constructor(otpRepository) {
    this.otpRepository = otpRepository;
    this.ttlSeconds = parseInt(process.env.OTP_TTL_SECONDS || '300', 10);
  }

  /**
   * Generate a 6-digit OTP code
   * @returns {string}
   */
  generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * Create and store a new OTP
   * @param {string} userId
   * @param {'EMAIL_VERIFY'|'FORGOT_PASSWORD'} type
   * @returns {Promise<string>} the OTP code
   */
  async createOTP(userId, type) {
    // Invalidate previous unused OTPs of same type
    await this.otpRepository.update({ user: { id: userId }, type, used: false }, { used: true });

    const code = this.generateCode();

    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    const otp = this.otpRepository.create({
      user: { id: userId },
      code,
      type,
      expires_at: expiresAt,
    });

    await this.otpRepository.save(otp);

    logger.info('OTP created', {
      context: 'OtpService',
      data: { userId, type, expiresAt },
    });

    return code;
  }

  /**
   * Verify an OTP code
   * @param {string} userId
   * @param {string} code
   * @param {'EMAIL_VERIFY'|'FORGOT_PASSWORD'} type
   * @returns {Promise<boolean>}
   */
  async verifyOTP(userId, code, type) {
    const otp = await this.otpRepository.findOne({
      where: {
        user: { id: userId },
        code,
        type,
        used: false,
      },
      order: { created_at: 'DESC' },
    });

    if (!otp) {
      throw new BadRequestException('Invalid or already used OTP code');
    }

    if (new Date() > new Date(otp.expires_at)) {
      throw new BadRequestException('OTP code has expired. Please request a new one.');
    }

    // Mark as used
    otp.used = true;
    await this.otpRepository.save(otp);

    logger.info('OTP verified', {
      context: 'OtpService',
      data: { userId, type },
    });

    return true;
  }
}

Injectable()(OtpService);
InjectRepository(OtpCodeEntity)(OtpService, undefined, 0);

module.exports = { OtpService };
