/**
 * OtpService Unit Tests — Redis-backed implementation
 *
 * All Redis calls are mocked via a plain object that mirrors the ioredis API
 * surface used by OtpService (get, set, del, incr, expire, ttl).
 * No real Redis connection is established.
 */
const { HttpException, HttpStatus, BadRequestException } = require('@nestjs/common');
const { OtpService } = require('./otp.service');

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a fully-mocked Redis client.
 * Each method is a jest.fn() returning sensible defaults.
 * Tests override individual methods with mockResolvedValueOnce / mockResolvedValue.
 */
function buildMockRedis() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(-2), // -2 = key does not exist
  };
}

/**
 * Construct an OtpService with the given mock and optional env overrides.
 * We bypass NestJS DI entirely — just instantiate directly.
 */
function buildService(mockRedis, envOverrides = {}) {
  // Temporarily override env vars
  const origEnv = {};
  for (const [k, v] of Object.entries(envOverrides)) {
    origEnv[k] = process.env[k];
    process.env[k] = v;
  }

  const svc = new OtpService(mockRedis);

  // Restore env vars
  for (const [k] of Object.entries(envOverrides)) {
    process.env[k] = origEnv[k];
  }

  return svc;
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('OtpService (Redis)', () => {
  const USER_ID = 'test-user-uuid';
  const TYPE = 'EMAIL_VERIFY';
  const VALID_CODE = '482931';

  let mockRedis;
  let service;

  beforeEach(() => {
    mockRedis = buildMockRedis();
    service = buildService(mockRedis);
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════
  // createOTP
  // ═══════════════════════════════════════════════════════

  describe('createOTP()', () => {
    it('should generate and store OTP when no cooldown is active', async () => {
      // No cooldown — ttl returns -2 (key absent)
      mockRedis.ttl.mockResolvedValue(-2);

      const code = await service.createOTP(USER_ID, TYPE);

      expect(code).toMatch(/^\d{6}$/);

      // OTP stored with TTL
      expect(mockRedis.set).toHaveBeenCalledWith(`otp:${USER_ID}:${TYPE}`, code, 'EX', service.ttl);

      // Attempt counter cleared
      expect(mockRedis.del).toHaveBeenCalledWith(`otp:attempts:${USER_ID}:${TYPE}`);

      // Cooldown set
      expect(mockRedis.set).toHaveBeenCalledWith(
        `otp:cooldown:${USER_ID}:${TYPE}`,
        '1',
        'EX',
        service.cooldownTtl,
      );
    });

    it('should throw 429 when cooldown is still active', async () => {
      // Cooldown still has 45 seconds remaining
      mockRedis.ttl.mockResolvedValue(45);

      await expect(service.createOTP(USER_ID, TYPE)).rejects.toThrow(HttpException);

      // Verify status code is 429
      await expect(service.createOTP(USER_ID, TYPE)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });

      // Should NOT store anything
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should overwrite an existing OTP (same key, EX reset)', async () => {
      mockRedis.ttl.mockResolvedValue(-2); // no cooldown

      await service.createOTP(USER_ID, TYPE);

      // set() is called for both the OTP key and the cooldown key
      const setCalls = mockRedis.set.mock.calls;
      const otpSetCall = setCalls.find((args) => args[0] === `otp:${USER_ID}:${TYPE}`);
      expect(otpSetCall).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════
  // verifyOTP — happy path
  // ═══════════════════════════════════════════════════════

  describe('verifyOTP() — success', () => {
    it('should return true and delete keys when code is correct', async () => {
      mockRedis.get
        .mockResolvedValueOnce(VALID_CODE) // _otpKey → stored code
        .mockResolvedValueOnce('0'); // _attemptsKey → 0 attempts so far

      mockRedis.ttl.mockResolvedValue(-2); // no active lock

      const result = await service.verifyOTP(USER_ID, VALID_CODE, TYPE);

      expect(result).toBe(true);

      // OTP key deleted
      expect(mockRedis.del).toHaveBeenCalledWith(`otp:${USER_ID}:${TYPE}`);

      // Attempt counter deleted
      expect(mockRedis.del).toHaveBeenCalledWith(`otp:attempts:${USER_ID}:${TYPE}`);
    });
  });

  // ═══════════════════════════════════════════════════════
  // verifyOTP — OTP expired / not found
  // ═══════════════════════════════════════════════════════

  describe('verifyOTP() — expired', () => {
    it('should throw 400 when OTP key does not exist in Redis', async () => {
      mockRedis.get.mockResolvedValue(null); // key expired / never created

      await expect(service.verifyOTP(USER_ID, VALID_CODE, TYPE)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.verifyOTP(USER_ID, VALID_CODE, TYPE)).rejects.toMatchObject({
        message: 'OTP has expired or was not found. Please request a new one.',
      });
    });
  });

  // ═══════════════════════════════════════════════════════
  // verifyOTP — wrong code / attempt tracking
  // ═══════════════════════════════════════════════════════

  describe('verifyOTP() — wrong code', () => {
    it('should throw 400 with remaining-attempts message on first wrong attempt', async () => {
      mockRedis.get
        .mockResolvedValueOnce(VALID_CODE) // stored code
        .mockResolvedValueOnce('0'); // current attempts = 0

      mockRedis.ttl.mockResolvedValue(-2); // not locked yet
      mockRedis.incr.mockResolvedValue(1); // attempts becomes 1

      await expect(service.verifyOTP(USER_ID, 'WRONG1', TYPE)).rejects.toMatchObject({
        message: `Invalid OTP code. 4 attempt(s) remaining.`,
      });

      expect(mockRedis.incr).toHaveBeenCalledWith(`otp:attempts:${USER_ID}:${TYPE}`);
      expect(mockRedis.expire).toHaveBeenCalledWith(
        `otp:attempts:${USER_ID}:${TYPE}`,
        service.lockTtl,
      );
    });

    it('should throw 429 when max attempts reached on this wrong attempt', async () => {
      // 4 prior failures (not yet locked), but this 5th wrong attempt will push count to 5
      // and trigger the 429 path inside the wrong-code branch
      mockRedis.get
        .mockResolvedValueOnce(VALID_CODE) // stored OTP
        .mockResolvedValueOnce('4'); // current attempts = 4 (below threshold)

      mockRedis.ttl.mockResolvedValue(-2); // not locked yet (4 < 5)
      mockRedis.incr.mockResolvedValue(5); // after incr → 5, triggers lock path

      await expect(service.verifyOTP(USER_ID, 'WRONG5', TYPE)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });

    it('should throw 429 immediately when account is already locked', async () => {
      mockRedis.get.mockResolvedValueOnce(VALID_CODE).mockResolvedValueOnce('5'); // already at max

      mockRedis.ttl.mockResolvedValue(800);

      await expect(service.verifyOTP(USER_ID, VALID_CODE, TYPE)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });

      // Must NOT increment further once locked
      expect(mockRedis.incr).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════
  // FORGOT_PASSWORD type
  // ═══════════════════════════════════════════════════════

  describe('FORGOT_PASSWORD type', () => {
    const FP_TYPE = 'FORGOT_PASSWORD';

    it('should use separate keys for FORGOT_PASSWORD type', async () => {
      mockRedis.ttl.mockResolvedValue(-2);

      const code = await service.createOTP(USER_ID, FP_TYPE);

      expect(mockRedis.set).toHaveBeenCalledWith(
        `otp:${USER_ID}:${FP_TYPE}`,
        code,
        'EX',
        service.ttl,
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        `otp:cooldown:${USER_ID}:${FP_TYPE}`,
        '1',
        'EX',
        service.cooldownTtl,
      );
    });

    it('should verify FORGOT_PASSWORD OTP independently of EMAIL_VERIFY', async () => {
      mockRedis.get
        .mockResolvedValueOnce(VALID_CODE) // FP OTP stored
        .mockResolvedValueOnce('0');

      mockRedis.ttl.mockResolvedValue(-2);

      const result = await service.verifyOTP(USER_ID, VALID_CODE, FP_TYPE);
      expect(result).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  // generateCode()
  // ═══════════════════════════════════════════════════════

  describe('generateCode()', () => {
    it('should always return a 6-digit numeric string', () => {
      for (let i = 0; i < 20; i++) {
        const code = service.generateCode();
        expect(code).toMatch(/^\d{6}$/);
        expect(Number(code)).toBeGreaterThanOrEqual(100000);
        expect(Number(code)).toBeLessThanOrEqual(999999);
      }
    });
  });
});
