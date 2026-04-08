/**
 * Auth RBAC Integration Tests
 *
 * Tests access control behavior:
 * - Public routes: register, login (no token needed)
 * - Protected routes: refresh, profile (token required)
 * - Role-based access: profile checks role
 * - Rejection: invalid token, wrong role, no token
 */
const { Test } = require('@nestjs/testing');
const { AuthService } = require('./auth.service');
const { JwtService } = require('@nestjs/jwt');
const { getRepositoryToken } = require('@nestjs/typeorm');
const { UserEntity } = require('../users/entities/user.entity');
const { OtpService } = require('./services/otp.service');
const { EmailService } = require('./services/email.service');
const { RolesGuard } = require('./guards/roles.guard');
const { Reflector } = require('@nestjs/core');
const bcrypt = require('bcrypt');

describe('Auth — RBAC & Guards', () => {
  let authService;
  let jwtService;

  const mockRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockOtpService = {
    createOTP: jest.fn().mockResolvedValue('123456'),
    verifyOTP: jest.fn().mockResolvedValue(true),
  };

  const mockEmailService = {
    sendOTP: jest.fn().mockResolvedValue(undefined),
  };

  const realJwtService = new JwtService({
    secret: 'test-secret',
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: mockRepo,
        },
        {
          provide: JwtService,
          useValue: realJwtService,
        },
        {
          provide: OtpService,
          useValue: mockOtpService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
    jwtService = moduleRef.get(JwtService);

    jest.clearAllMocks();
  });

  // ─────────────────── Register Tests ───────────────────

  describe('register()', () => {
    it('should register a new user and send OTP (no tokens returned)', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-pw');
      mockRepo.create.mockReturnValue({
        id: 'user-1',
        email: 'test@test.com',
        role: 'ROLE_GUARDIAN',
        email_verified: false,
        is_active: false,
      });
      mockRepo.save.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        role: 'ROLE_GUARDIAN',
      });

      const result = await authService.register({
        email: 'test@test.com',
        password: 'password123',
        displayName: 'Test User',
      });

      expect(result.message).toBeDefined();
      expect(result.email).toBe('test@test.com');
      // Should NOT return tokens (pending OTP verification)
      expect(result.accessToken).toBeUndefined();
    });

    it('should throw ConflictException if verified email already exists', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 'existing-user', email_verified: true });

      await expect(
        authService.register({
          email: 'existing@test.com',
          password: 'password123',
          displayName: 'Test',
        }),
      ).rejects.toThrow('This email is already registered');
    });

    it('should default role to null', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-pw');
      mockRepo.create.mockImplementation((data) => ({
        id: 'user-2',
        email: data.email,
        role: data.role,
      }));
      mockRepo.save.mockImplementation((user) => Promise.resolve(user));

      await authService.register({
        email: 'guardian@test.com',
        password: 'password123',
        displayName: 'Guardian User',
      });

      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ role: null }));
    });
  });

  // ─────────────────── Login Tests ───────────────────

  describe('login()', () => {
    it('should return tokens on valid credentials (verified user)', async () => {
      mockRepo.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        password_hash: 'hashed-pw',
        role: 'ROLE_CLINICIAN',
        email_verified: true,
        is_active: true,
      });
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
      mockRepo.save.mockResolvedValue({});

      const result = await authService.login({
        email: 'test@test.com',
        password: 'password123',
      });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.role).toBe('ROLE_CLINICIAN');
    });

    it('should throw UnauthorizedException for non-existent email', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'nonexist@test.com',
          password: 'password123',
        }),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      mockRepo.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        password_hash: 'hashed-pw',
        role: 'ROLE_CHILD',
        email_verified: true,
        is_active: true,
      });
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

      await expect(
        authService.login({
          email: 'test@test.com',
          password: 'wrongpassword',
        }),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should reject login if email not verified', async () => {
      mockRepo.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        email_verified: false,
        is_active: false,
      });

      await expect(
        authService.login({
          email: 'test@test.com',
          password: 'password123',
        }),
      ).rejects.toThrow('Please verify your email');
    });
  });

  // ─────────────────── Refresh Tests ───────────────────

  describe('refresh()', () => {
    it('should return new access token with valid refresh token', async () => {
      const validRefreshToken = jwtService.sign(
        { sub: 'user-1', email: 'test@test.com', role: 'ROLE_CHILD' },
        { expiresIn: '7d' },
      );

      mockRepo.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        role: 'ROLE_CHILD',
      });

      const result = await authService.refresh({
        refreshToken: validRefreshToken,
      });

      expect(result.accessToken).toBeDefined();

      // Verify the new token is valid
      const decoded = jwtService.verify(result.accessToken);
      expect(decoded.sub).toBe('user-1');
      expect(decoded.email).toBe('test@test.com');
    });

    it('should throw UnauthorizedException for expired refresh token', async () => {
      const expiredToken = jwtService.sign(
        { sub: 'user-1', email: 'test@test.com', role: 'ROLE_CHILD' },
        { expiresIn: '0s' },
      );

      // Wait a moment for token to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      await expect(authService.refresh({ refreshToken: expiredToken })).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      await expect(authService.refresh({ refreshToken: 'invalid-token-string' })).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('should throw UnauthorizedException if user no longer exists', async () => {
      const validRefreshToken = jwtService.sign(
        { sub: 'deleted-user', email: 'deleted@test.com', role: 'ROLE_CHILD' },
        { expiresIn: '7d' },
      );

      mockRepo.findOne.mockResolvedValue(null);

      await expect(authService.refresh({ refreshToken: validRefreshToken })).rejects.toThrow(
        'Invalid refresh token',
      );
    });
  });

  // ─────────────────── RolesGuard Tests ───────────────────

  describe('RolesGuard', () => {
    let rolesGuard;
    let reflector;

    beforeEach(() => {
      reflector = new Reflector();
      rolesGuard = new RolesGuard(reflector);
    });

    function createMockContext(user, handlerRoles) {
      const handler = () => {};
      if (handlerRoles) {
        Reflect.defineMetadata('roles', handlerRoles, handler);
      }

      return {
        getHandler: () => handler,
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      };
    }

    it('should allow access when no @Roles decorator is set', () => {
      const context = createMockContext({ role: 'ROLE_CHILD' }, null);
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow access when user role matches required role', () => {
      const context = createMockContext({ role: 'ROLE_CLINICIAN' }, ['ROLE_CLINICIAN']);
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should deny access when user role does not match', () => {
      const context = createMockContext({ role: 'ROLE_CHILD' }, ['ROLE_CLINICIAN']);
      expect(rolesGuard.canActivate(context)).toBe(false);
    });

    it('should allow access when user has one of multiple allowed roles', () => {
      const context = createMockContext({ role: 'ROLE_GUARDIAN' }, [
        'ROLE_CLINICIAN',
        'ROLE_GUARDIAN',
      ]);
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should deny access when no user is attached to request', () => {
      const context = createMockContext(null, ['ROLE_CHILD']);
      expect(rolesGuard.canActivate(context)).toBe(false);
    });

    it('should deny access when user is undefined', () => {
      const context = createMockContext(undefined, ['ROLE_CHILD']);
      expect(rolesGuard.canActivate(context)).toBe(false);
    });
  });

  // ─────────────────── JWT Token Validation ───────────────────

  describe('JWT Token Validation', () => {
    it('should have different access and refresh tokens', async () => {
      mockRepo.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        password_hash: 'hashed',
        role: 'ROLE_CHILD',
        email_verified: true,
        is_active: true,
      });
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
      mockRepo.save.mockResolvedValue({});

      const result = await authService.login({
        email: 'test@test.com',
        password: 'password123',
      });

      expect(result.accessToken).not.toBe(result.refreshToken);
    });

    it('should include correct payload in token', async () => {
      mockRepo.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        password_hash: 'hashed',
        role: 'ROLE_GUARDIAN',
        email_verified: true,
        is_active: true,
      });
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
      mockRepo.save.mockResolvedValue({});

      const result = await authService.login({
        email: 'test@test.com',
        password: 'password123',
      });

      const decoded = jwtService.decode(result.accessToken);
      expect(decoded.sub).toBe('user-1');
      expect(decoded.email).toBe('test@test.com');
      expect(decoded.role).toBe('ROLE_GUARDIAN');
    });
  });
});
