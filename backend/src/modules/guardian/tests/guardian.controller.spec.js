require('reflect-metadata');

const { GUARDS_METADATA } = require('@nestjs/common/constants');
const { BadRequestException } = require('@nestjs/common');
const { THROTTLER_LIMIT, THROTTLER_TTL } = require('@nestjs/throttler/dist/throttler.constants');

const { GuardianController } = require('../guardian.controller');
const { JwtAuthGuard } = require('../../auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../../auth/guards/roles.guard');
const { GuardianThrottlerGuard } = require('../guards/guardian-throttler.guard');

describe('GuardianController', () => {
  let controller;
  let guardianService;

  const guardianId = '11111111-1111-4111-8111-111111111111';
  const childId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    guardianService = {
      exportChildData: jest.fn(),
      eraseChildData: jest.fn(),
    };

    controller = new GuardianController(guardianService);
  });

  it('should attach guardian guards, role and 1/min throttle on export route', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      GuardianController.prototype.exportChildData,
    );
    const roles = Reflect.getMetadata('roles', GuardianController.prototype.exportChildData);
    const limit = Reflect.getMetadata(
      `${THROTTLER_LIMIT}default`,
      GuardianController.prototype.exportChildData,
    );
    const ttl = Reflect.getMetadata(
      `${THROTTLER_TTL}default`,
      GuardianController.prototype.exportChildData,
    );

    expect(guards).toEqual([JwtAuthGuard, RolesGuard, GuardianThrottlerGuard]);
    expect(roles).toEqual(['ROLE_GUARDIAN']);
    expect(limit).toBe(1);
    expect(ttl).toBe(60000);
  });

  it('should attach guardian guards, role and 1/min throttle on erase route', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      GuardianController.prototype.eraseChildData,
    );
    const roles = Reflect.getMetadata('roles', GuardianController.prototype.eraseChildData);
    const limit = Reflect.getMetadata(
      `${THROTTLER_LIMIT}default`,
      GuardianController.prototype.eraseChildData,
    );
    const ttl = Reflect.getMetadata(
      `${THROTTLER_TTL}default`,
      GuardianController.prototype.eraseChildData,
    );

    expect(guards).toEqual([JwtAuthGuard, RolesGuard, GuardianThrottlerGuard]);
    expect(roles).toEqual(['ROLE_GUARDIAN']);
    expect(limit).toBe(1);
    expect(ttl).toBe(60000);
  });

  it('should export child data for valid request', async () => {
    guardianService.exportChildData.mockResolvedValue({
      childId,
      exportedByGuardianId: guardianId,
      otpCodes: [{ id: 'otp-1' }],
    });

    const result = await controller.exportChildData(
      childId,
      { confirmationToken: 'CONFIRM_EXPORT_CHILD_DATA' },
      { user: { sub: guardianId } },
    );

    expect(result.childId).toBe(childId);
    expect(result.otpCodes).toHaveLength(1);
    expect(guardianService.exportChildData).toHaveBeenCalledWith(
      guardianId,
      childId,
      'CONFIRM_EXPORT_CHILD_DATA',
    );
  });

  it('should erase child data for valid request', async () => {
    guardianService.eraseChildData.mockResolvedValue({
      erased: true,
      childId,
    });

    const result = await controller.eraseChildData(
      childId,
      { confirmationToken: 'CONFIRM_ERASE_CHILD_DATA' },
      { user: { sub: guardianId } },
    );

    expect(result.erased).toBe(true);
    expect(guardianService.eraseChildData).toHaveBeenCalledWith(
      guardianId,
      childId,
      'CONFIRM_ERASE_CHILD_DATA',
    );
  });

  it('should throw 400 for invalid childId', async () => {
    await expect(
      controller.exportChildData(
        'not-a-uuid',
        { confirmationToken: 'CONFIRM_EXPORT_CHILD_DATA' },
        { user: { sub: guardianId } },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw 400 when confirmationToken is missing', async () => {
    await expect(
      controller.eraseChildData(childId, {}, { user: { sub: guardianId } }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw 400 when confirmationToken format is invalid', async () => {
    await expect(
      controller.eraseChildData(
        childId,
        { confirmationToken: 'bad token!' },
        { user: { sub: guardianId } },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
