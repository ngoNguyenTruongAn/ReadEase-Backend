/**
 * OtpService — Redis-backed
 *
 * Replaces the previous PostgreSQL/TypeORM implementation.
 * All OTP state is stored exclusively in Redis using three key namespaces:
 *
 *   otp:{userId}:{type}            → 6-digit code string, TTL = OTP_TTL_SECONDS
 *   otp:attempts:{userId}:{type}   → failed-attempt counter,  TTL = OTP_LOCK_SECONDS
 *   otp:cooldown:{userId}:{type}   → resend guard sentinel,   TTL = OTP_COOLDOWN_SEC
 *
 * Environment variables (all optional, defaults shown):
 *   OTP_TTL_SECONDS   = 300   (OTP valid for 5 minutes)
 *   OTP_LOCK_SECONDS  = 900   (lock for 15 minutes after max failed attempts)
 *   OTP_COOLDOWN_SEC  = 60    (minimum seconds between resend requests)
 *   OTP_MAX_ATTEMPTS  = 5     (failed attempts before lock)
 */
const { Injectable, Inject, BadRequestException } = require('@nestjs/common');
const { HttpException, HttpStatus } = require('@nestjs/common');
const { logger } = require('../../../common/logger/winston.config');

class OtpService {
  /**
   * @param {import('ioredis').Redis} redisClient
   */
  constructor(redisClient) {
    this.redis = redisClient;
    this.ttl = parseInt(process.env.OTP_TTL_SECONDS || '300', 10);
    this.lockTtl = parseInt(process.env.OTP_LOCK_SECONDS || '900', 10);
    this.cooldownTtl = parseInt(process.env.OTP_COOLDOWN_SEC || '60', 10);
    this.maxAttempts = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);
  }

  // ─── Key helpers ────────────────────────────────────────────────────────────

  _otpKey(userId, type) {
    return `otp:${userId}:${type}`;
  }

  _attemptsKey(userId, type) {
    return `otp:attempts:${userId}:${type}`;
  }

  _cooldownKey(userId, type) {
    return `otp:cooldown:${userId}:${type}`;
  }

  // ─── Code generator ─────────────────────────────────────────────────────────

  /**
   * Generate a cryptographically adequate 6-digit code.
   * @returns {string}
   */
  generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  // ─── createOTP ──────────────────────────────────────────────────────────────

  /**
   * Generate and store a new OTP in Redis.
   *
   * Throws 429 if the user requests another OTP within the cooldown window.
   *
   * @param {string} userId
   * @param {'EMAIL_VERIFY'|'FORGOT_PASSWORD'} type
   * @returns {Promise<string>} the generated OTP code (passed to EmailService)
   */
  async createOTP(userId, type) {
    // 1. Cooldown guard — prevent spam
    const cooldownTtlRemaining = await this.redis.ttl(this._cooldownKey(userId, type));
    if (cooldownTtlRemaining > 0) {
      throw new HttpException(
        `Please wait ${cooldownTtlRemaining} second(s) before requesting a new OTP.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Generate code
    const code = this.generateCode();

    // 3. Store OTP — overwrites any previous OTP for same user+type
    await this.redis.set(this._otpKey(userId, type), code, 'EX', this.ttl);

    // 4. Reset failed-attempt counter (fresh start for the new code)
    await this.redis.del(this._attemptsKey(userId, type));

    // 5. Set cooldown sentinel
    await this.redis.set(this._cooldownKey(userId, type), '1', 'EX', this.cooldownTtl);

    logger.info('OTP created (Redis)', {
      context: 'OtpService',
      data: { userId, type, ttl: this.ttl },
    });

    return code;
  }

  // ─── verifyOTP ──────────────────────────────────────────────────────────────

  /**
   * Verify a submitted OTP code against the Redis-stored value.
   *
   * Brute-force protection:
   *   - Each wrong attempt increments otp:attempts:{userId}:{type}.
   *   - After OTP_MAX_ATTEMPTS failures the account is locked for OTP_LOCK_SECONDS.
   *
   * @param {string} userId
   * @param {string} code   – value submitted by the user
   * @param {'EMAIL_VERIFY'|'FORGOT_PASSWORD'} type
   * @returns {Promise<true>}
   */
  async verifyOTP(userId, code, type) {
    // 1. Retrieve stored OTP
    const stored = await this.redis.get(this._otpKey(userId, type));
    if (!stored) {
      throw new BadRequestException('OTP has expired or was not found. Please request a new one.');
    }

    // 2. Check whether account is already locked
    const lockTtlRemaining = await this.redis.ttl(this._attemptsKey(userId, type));
    const currentAttempts = parseInt(
      (await this.redis.get(this._attemptsKey(userId, type))) || '0',
      10,
    );

    if (currentAttempts >= this.maxAttempts) {
      throw new HttpException(
        `Too many incorrect attempts. Please try again in ${Math.ceil(lockTtlRemaining / 60)} minute(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 3. Compare code
    if (stored !== code) {
      // Increment attempt counter and (re-)set lock TTL
      const newCount = await this.redis.incr(this._attemptsKey(userId, type));
      await this.redis.expire(this._attemptsKey(userId, type), this.lockTtl);

      const remaining = this.maxAttempts - newCount;

      if (remaining <= 0) {
        throw new HttpException(
          `Too many incorrect attempts. Account locked for ${Math.ceil(this.lockTtl / 60)} minute(s).`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new BadRequestException(`Invalid OTP code. ${remaining} attempt(s) remaining.`);
    }

    // 4. Correct — clean up OTP + attempt counter (cooldown intentionally left)
    await this.redis.del(this._otpKey(userId, type));
    await this.redis.del(this._attemptsKey(userId, type));

    logger.info('OTP verified (Redis)', {
      context: 'OtpService',
      data: { userId, type },
    });

    return true;
  }
}

// ── NestJS DI decorators ──────────────────────────────────────────────────────
Injectable()(OtpService);
require('@nestjs/common').Inject('REDIS_OTP_CLIENT')(OtpService, undefined, 0);

module.exports = { OtpService };
