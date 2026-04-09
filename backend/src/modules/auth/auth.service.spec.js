const { Test } = require('@nestjs/testing');
const { AuthService } = require('./auth.service');
const { JwtService } = require('@nestjs/jwt');
const { getRepositoryToken } = require('@nestjs/typeorm');

const bcrypt = require('bcrypt');

const { UserEntity } = require('../users/entities/user.entity');
const { OtpService } = require('./services/otp.service');
const { EmailService } = require('./services/email.service');

describe('AuthService', () => {
  let service;
  let repo;
  let otpService;
  let emailService;

  const mockRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockJwt = {
    sign: jest.fn().mockReturnValue('mock-token'),
    verify: jest.fn(),
  };

  const mockOtpService = {
    createOTP: jest.fn().mockResolvedValue('123456'),
    verifyOTP: jest.fn().mockResolvedValue(true),
  };

  const mockEmailService = {
    sendOTP: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: mockRepo,
        },
        {
          provide: JwtService,
          useValue: mockJwt,
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

    service = module.get(AuthService);
    repo = module.get(getRepositoryToken(UserEntity));
    otpService = module.get(OtpService);
    emailService = module.get(EmailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── Register ──
  it('should register user and send OTP', async () => {
    repo.findOne.mockResolvedValue(null);

    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password');

    repo.create.mockReturnValue({
      id: 'uuid-1',
      email: 'test@mail.com',
      role: 'ROLE_GUARDIAN',
      email_verified: false,
      is_active: false,
    });

    repo.save.mockResolvedValue({
      id: 'uuid-1',
      email: 'test@mail.com',
      role: 'ROLE_GUARDIAN',
    });

    const result = await service.register({
      email: 'test@mail.com',
      password: '12345678',
      displayName: 'Test',
    });

    expect(result.message).toBeDefined();
    expect(result.email).toBe('test@mail.com');
    expect(otpService.createOTP).toHaveBeenCalledWith('uuid-1', 'EMAIL_VERIFY');
    expect(emailService.sendOTP).toHaveBeenCalled();
    // Should NOT return tokens (pending verification)
    expect(result.accessToken).toBeUndefined();
  });

  it('should reject duplicate email', async () => {
    repo.findOne.mockResolvedValue({
      id: 'uuid-2',
      email: 'test@mail.com',
      email_verified: true,
    });

    await expect(
      service.register({
        email: 'test@mail.com',
        password: '12345678',
        displayName: 'Test',
      }),
    ).rejects.toThrow('This email is already registered');
  });

  // ── Verify Email ──
  it('should verify email and activate account', async () => {
    repo.findOne.mockResolvedValue({
      id: 'uuid-1',
      email: 'test@mail.com',
      role: 'ROLE_GUARDIAN',
      email_verified: false,
      is_active: false,
    });

    repo.save.mockResolvedValue({});

    const result = await service.verifyEmail({
      email: 'test@mail.com',
      code: '123456',
    });

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(otpService.verifyOTP).toHaveBeenCalledWith('uuid-1', '123456', 'EMAIL_VERIFY');
  });

  it('should verify email and keep child account inactive, generating invite code', async () => {
    const userRoleChild = {
      id: 'uuid-2',
      email: 'child@test.com',
      role: 'ROLE_CHILD',
      email_verified: false,
      is_active: false,
    };
    repo.findOne.mockResolvedValue(userRoleChild);
    repo.save.mockResolvedValue({});

    const result = await service.verifyEmail({
      email: 'child@test.com',
      code: '654321',
    });

    expect(result.inviteCode).toBeDefined();
    expect(userRoleChild.is_active).toBe(false);
    expect(userRoleChild.guardian_invite_code).toBeDefined();
    expect(userRoleChild.email_verified).toBe(true);
  });

  // ── Login ──
  it('should reject login if email not verified', async () => {
    repo.findOne.mockResolvedValue({
      id: 'uuid-1',
      email: 'test@mail.com',
      email_verified: false,
      is_active: false,
    });

    await expect(service.login({ email: 'test@mail.com', password: '12345678' })).rejects.toThrow(
      'Please verify your email',
    );
  });

  it('should login successfully', async () => {
    repo.findOne.mockResolvedValue({
      id: 'uuid-1',
      email: 'test@mail.com',
      password_hash: 'hashed',
      role: 'ROLE_CHILD',
      email_verified: true,
      is_active: true,
    });

    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    repo.save.mockResolvedValue({});

    const result = await service.login({
      email: 'test@mail.com',
      password: '12345678',
    });

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user.email).toBe('test@mail.com');
  });

  // ── Forgot Password ──
  it('should send forgot password OTP', async () => {
    repo.findOne.mockResolvedValue({
      id: 'uuid-1',
      email: 'test@mail.com',
    });

    const result = await service.forgotPassword({ email: 'test@mail.com' });

    expect(result.message).toBeDefined();
    expect(otpService.createOTP).toHaveBeenCalledWith('uuid-1', 'FORGOT_PASSWORD');
    expect(emailService.sendOTP).toHaveBeenCalled();
  });

  // ── Reset Password ──
  it('should reset password with OTP', async () => {
    repo.findOne.mockResolvedValue({
      id: 'uuid-1',
      email: 'test@mail.com',
    });

    jest.spyOn(bcrypt, 'hash').mockResolvedValue('new-hashed');
    repo.save.mockResolvedValue({});

    const result = await service.resetPassword({
      email: 'test@mail.com',
      code: '123456',
      newPassword: 'newpass123',
    });

    expect(result.message).toBeDefined();
    expect(otpService.verifyOTP).toHaveBeenCalledWith('uuid-1', '123456', 'FORGOT_PASSWORD');
  });

  // ── Change Password ──
  it('should change password with correct old password', async () => {
    repo.findOne.mockResolvedValue({
      id: 'uuid-1',
      password_hash: 'old-hashed',
    });

    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('new-hashed');
    repo.save.mockResolvedValue({});

    const result = await service.changePassword('uuid-1', {
      oldPassword: 'oldpass123',
      newPassword: 'newpass123',
    });

    expect(result.message).toBeDefined();
  });

  it('should reject change password with wrong old password', async () => {
    repo.findOne.mockResolvedValue({
      id: 'uuid-1',
      password_hash: 'old-hashed',
    });

    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

    await expect(
      service.changePassword('uuid-1', {
        oldPassword: 'wrongpass',
        newPassword: 'newpass123',
      }),
    ).rejects.toThrow('Old password is incorrect');
  });
});
