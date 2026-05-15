require('reflect-metadata');

const { GUARDS_METADATA } = require('@nestjs/common/constants');
const { BadRequestException, ForbiddenException } = require('@nestjs/common');
const { GamificationController } = require('../gamification.controller');

describe('GamificationController', () => {
  let controller;
  let tokenService;

  beforeEach(() => {
    tokenService = {
      getBalance: jest.fn(),
      getHistory: jest.fn(),
      listActiveRewards: jest.fn(),
      redeemReward: jest.fn(),
      setChildAvatar: jest.fn(),
    };

    controller = new GamificationController(tokenService);
  });

  it('should validate guard and role metadata for token balance route', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      GamificationController.prototype.getBalance,
    );
    const roles = Reflect.getMetadata('roles', GamificationController.prototype.getBalance);

    expect(guards).toBeDefined();
    expect(roles).toEqual(['ROLE_CHILD', 'ROLE_GUARDIAN', 'ROLE_CLINICIAN']);
  });

  it('should return token balance for valid child request', async () => {
    tokenService.getBalance.mockResolvedValue({
      childId: '11111111-1111-4111-8111-111111111111',
      balance: 200,
    });

    const result = await controller.getBalance('11111111-1111-4111-8111-111111111111', {
      user: { sub: '11111111-1111-4111-8111-111111111111', role: 'ROLE_CHILD' },
    });

    expect(result.balance).toBe(200);
    expect(result.childId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('should block child from viewing another child balance', async () => {
    await expect(
      controller.getBalance('11111111-1111-4111-8111-111111111111', {
        user: { sub: '22222222-2222-4222-8222-222222222222', role: 'ROLE_CHILD' },
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should validate history query', async () => {
    await expect(
      controller.getHistory(
        '11111111-1111-4111-8111-111111111111',
        { limit: -1 },
        {
          user: { sub: '11111111-1111-4111-8111-111111111111', role: 'ROLE_CHILD' },
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should validate reward redeem payload', async () => {
    await expect(
      controller.redeemReward(
        '33333333-3333-4333-8333-333333333333',
        { childId: 'not-uuid', expectedVersion: 1 },
        { user: { sub: '11111111-1111-4111-8111-111111111111', role: 'ROLE_CHILD' } },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should set current child avatar for valid reward payload', async () => {
    tokenService.setChildAvatar.mockResolvedValue({
      childId: '11111111-1111-4111-8111-111111111111',
      avatar_reward_id: '33333333-3333-4333-8333-333333333333',
      avatar_url: 'https://cdn.test/avatar.png',
      avatar_name: 'Avatar',
    });

    const result = await controller.setMyAvatar(
      { rewardId: '33333333-3333-4333-8333-333333333333' },
      { user: { sub: '11111111-1111-4111-8111-111111111111', role: 'ROLE_CHILD' } },
    );

    expect(tokenService.setChildAvatar).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
    );
    expect(result.avatar_url).toBe('https://cdn.test/avatar.png');
  });

  it('should validate avatar reward payload', async () => {
    await expect(
      controller.setMyAvatar(
        { rewardId: 'not-uuid' },
        { user: { sub: '11111111-1111-4111-8111-111111111111', role: 'ROLE_CHILD' } },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
