const { BadRequestException, ConflictException, NotFoundException } = require('@nestjs/common');
const { TokenService } = require('../gamification.service');

describe('TokenService', () => {
  let service;
  let dataSource;
  let queryRunner;

  beforeEach(() => {
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        query: jest.fn(),
      },
    };

    dataSource = {
      query: jest.fn(),
      createQueryRunner: jest.fn(() => queryRunner),
    };

    service = new TokenService(dataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should compute effort from summary when direct score is missing', () => {
    const score = service.computeEffortFromSummary({
      state_counts: {
        FLUENT: 4,
        REGRESSION: 2,
        DISTRACTION: 0,
      },
    });

    expect(score).toBeCloseTo(0.9167, 4);
  });

  it('should earn base tokens from session effort score', async () => {
    queryRunner.manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'sess-1',
          user_id: 'child-1',
          effort_score: 0.85,
          cognitive_state_summary: {},
        },
      ])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);

    const result = await service.earnFromSession('child-1', 'sess-1');

    expect(result.baseTokens).toBe(85);
    expect(result.bonusTokens).toBe(0);
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });

  it('should be idempotent when session already earned', async () => {
    queryRunner.manager.query.mockResolvedValueOnce([
      {
        id: 'tok-1',
        amount: 80,
        type: 'EARN',
        effort_score: 0.8,
      },
    ]);

    const result = await service.earnFromSession('child-1', 'sess-1');

    expect(result.idempotent).toBe(true);
    expect(result.baseTokens).toBe(80);
    expect(queryRunner.manager.query).toHaveBeenCalledTimes(1);
  });

  it('should add streak bonus for every 3 high-effort sessions', async () => {
    queryRunner.manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'sess-3',
          user_id: 'child-1',
          effort_score: 0.9,
          cognitive_state_summary: {},
        },
      ])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        { effort_score: 0.9 },
        { effort_score: 0.82 },
        { effort_score: 0.75 },
        { effort_score: 0.5 },
      ])
      .mockResolvedValueOnce(undefined);

    const result = await service.earnFromSession('child-1', 'sess-3');

    expect(result.streakCount).toBe(3);
    expect(result.bonusTokens).toBe(20);
  });

  it('should throw NotFoundException when session does not exist', async () => {
    queryRunner.manager.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(service.earnFromSession('child-1', 'missing')).rejects.toThrow(NotFoundException);
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  it('should throw BadRequestException when session belongs to another child', async () => {
    queryRunner.manager.query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'sess-1',
        user_id: 'child-2',
        effort_score: 0.7,
        cognitive_state_summary: {},
      },
    ]);

    await expect(service.earnFromSession('child-1', 'sess-1')).rejects.toThrow(BadRequestException);
  });

  it('should return current balance', async () => {
    dataSource.query.mockResolvedValue([{ balance: 150 }]);

    const result = await service.getBalance('child-1');

    expect(result.balance).toBe(150);
  });

  it('should redeem reward successfully with optimistic locking', async () => {
    queryRunner.manager.query
      .mockResolvedValueOnce([
        {
          id: 'reward-1',
          name: 'Sticker',
          cost: 100,
          version: 5,
          stock: 9,
          is_active: true,
        },
      ])
      .mockResolvedValueOnce([{ version: 6, stock: 8 }])
      .mockResolvedValueOnce([{ id: 'row-lock' }])
      .mockResolvedValueOnce([{ balance: 150 }])
      .mockResolvedValueOnce([
        {
          id: 'redeem-1',
          child_id: 'child-1',
          reward_id: 'reward-1',
          cost: 100,
          redeemed_at: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce(undefined);

    const result = await service.redeemReward('child-1', 'reward-1', 5);

    expect(result.balanceAfter).toBe(50);
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });

  it('should throw ConflictException when optimistic lock fails', async () => {
    queryRunner.manager.query
      .mockResolvedValueOnce([
        {
          id: 'reward-1',
          name: 'Sticker',
          cost: 100,
          version: 5,
          stock: 5,
          is_active: true,
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(service.redeemReward('child-1', 'reward-1', 5)).rejects.toThrow(ConflictException);
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  it('should throw BadRequestException on insufficient balance and rollback', async () => {
    queryRunner.manager.query
      .mockResolvedValueOnce([
        {
          id: 'reward-1',
          name: 'Sticker',
          cost: 100,
          version: 1,
          stock: 5,
          is_active: true,
        },
      ])
      .mockResolvedValueOnce([{ version: 2, stock: 4 }])
      .mockResolvedValueOnce([{ id: 'row-lock' }])
      .mockResolvedValueOnce([{ balance: 80 }]);

    await expect(service.redeemReward('child-1', 'reward-1', 1)).rejects.toThrow(
      BadRequestException,
    );
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });
});
