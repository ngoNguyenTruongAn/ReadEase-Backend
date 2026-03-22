require('reflect-metadata');

const { BadRequestException } = require('@nestjs/common');
const { GUARDS_METADATA } = require('@nestjs/common/constants');

const { TrackingController } = require('../tracking.controller');
const { JwtAuthGuard } = require('../../auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../../auth/guards/roles.guard');

describe('TrackingController', () => {
  let controller;
  let mlClientService;
  let repo;
  let dataSource;

  beforeEach(() => {
    mlClientService = {
      calibrate: jest.fn(),
    };

    repo = {
      findOne: jest.fn(),
      update: jest.fn(),
      save: jest.fn(),
    };

    dataSource = {
      getRepository: jest.fn().mockReturnValue(repo),
    };

    controller = new TrackingController(mlClientService, dataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should update baseline_json when child profile already exists', async () => {
    const childId = 'f49b53f9-b3a1-4cc4-b3c0-1f77e41f9b14';
    const body = {
      duration: 30000,
      gameType: 'target_tracking',
      events: [
        { x: 10, y: 10, timestamp: 1000 },
        { x: 20, y: 25, timestamp: 1200 },
        { x: 40, y: 30, timestamp: 1400 },
      ],
    };
    const req = {
      user: {
        sub: childId,
        role: 'ROLE_CHILD',
      },
    };

    repo.findOne.mockResolvedValue({ id: 'profile-1', user_id: childId });
    repo.update.mockResolvedValue({ affected: 1 });
    mlClientService.calibrate.mockResolvedValue({
      child_id: childId,
      source: 'ml_model',
      baseline: {
        velocity_baseline: 0.71,
        motor_profile: 'NORMAL',
        calibrated_at: '2026-03-22T10:00:00.000Z',
      },
    });

    const result = await controller.calibrate(body, req);

    expect(mlClientService.calibrate).toHaveBeenCalledWith(childId, body.events);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { user_id: childId } });
    expect(repo.update).toHaveBeenCalledWith('profile-1', {
      baseline_json: expect.objectContaining({ motor_profile: 'NORMAL' }),
    });
    expect(repo.save).not.toHaveBeenCalled();

    expect(result.child_id).toBe(childId);
    expect(result.duration).toBe(30000);
    expect(result.game_type).toBe('target_tracking');
    expect(result.baseline.motor_profile).toBe('NORMAL');
  });

  it('should create profile when not found and persist baseline_json', async () => {
    const childId = 'f49b53f9-b3a1-4cc4-b3c0-1f77e41f9b14';
    const body = {
      childId,
      duration: 30000,
      gameType: 'target_tracking',
      events: [
        { x: 10, y: 10, timestamp: 1000 },
        { x: 15, y: 20, timestamp: 1100 },
        { x: 30, y: 22, timestamp: 1300 },
      ],
    };

    repo.findOne.mockResolvedValue(null);
    repo.save.mockResolvedValue({ id: 'profile-2', user_id: childId });
    mlClientService.calibrate.mockResolvedValue({
      child_id: childId,
      source: 'fallback_calculated',
      baseline: {
        velocity_baseline: 0.44,
        motor_profile: 'SLOW',
        calibrated_at: '2026-03-22T10:00:00.000Z',
      },
    });

    const result = await controller.calibrate(body, { user: { sub: childId } });

    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith({
      user_id: childId,
      baseline_json: expect.objectContaining({ motor_profile: 'SLOW' }),
    });

    expect(result.source).toBe('fallback_calculated');
    expect(result.baseline.motor_profile).toBe('SLOW');
  });

  it('should throw BadRequestException for invalid events payload', async () => {
    await expect(
      controller.calibrate(
        {
          duration: 30000,
          gameType: 'target_tracking',
          events: [{ x: 1, y: 2, timestamp: 1000 }],
        },
        { user: { sub: 'f49b53f9-b3a1-4cc4-b3c0-1f77e41f9b14' } },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when request body is undefined', async () => {
    await expect(
      controller.calibrate(undefined, {
        user: { sub: 'f49b53f9-b3a1-4cc4-b3c0-1f77e41f9b14' },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should use childId from request user when payload childId is missing', async () => {
    const reqChildId = 'f49b53f9-b3a1-4cc4-b3c0-1f77e41f9b14';
    const body = {
      duration: 30000,
      gameType: 'target_tracking',
      events: [
        { x: 0, y: 0, timestamp: 1 },
        { x: 5, y: 8, timestamp: 2 },
        { x: 7, y: 13, timestamp: 3 },
      ],
    };

    repo.findOne.mockResolvedValue({ id: 'profile-1', user_id: reqChildId });
    repo.update.mockResolvedValue({ affected: 1 });
    mlClientService.calibrate.mockResolvedValue({
      child_id: reqChildId,
      source: 'ml_model',
      baseline: {
        velocity_baseline: 0.77,
        motor_profile: 'NORMAL',
        calibrated_at: '2026-03-22T10:00:00.000Z',
      },
    });

    await controller.calibrate(body, { user: { sub: reqChildId } });

    expect(mlClientService.calibrate).toHaveBeenCalledWith(reqChildId, body.events);
  });

  it('should attach JwtAuthGuard and RolesGuard metadata to calibrate endpoint', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, TrackingController.prototype.calibrate);
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
  });

  it('should restrict calibrate endpoint roles to child/guardian/clinician', () => {
    const roles = Reflect.getMetadata('roles', TrackingController.prototype.calibrate);
    expect(roles).toEqual(['ROLE_CHILD', 'ROLE_GUARDIAN', 'ROLE_CLINICIAN']);
  });
});
