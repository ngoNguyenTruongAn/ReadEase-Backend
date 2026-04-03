const { ForbiddenException, UnauthorizedException } = require('@nestjs/common');
const { GuardianService } = require('../guardian.service');

describe('GuardianService', () => {
  let service;
  let dataSource;
  let configService;
  let queryRunner;

  const guardianId = '11111111-1111-4111-8111-111111111111';
  const childId = '22222222-2222-4222-8222-222222222222';

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

    configService = {
      get: jest.fn((key, defaultValue) => {
        if (key === 'GUARDIAN_EXPORT_CONFIRMATION_TOKEN') {
          return 'CONFIRM_EXPORT_CHILD_DATA';
        }
        if (key === 'GUARDIAN_ERASE_CONFIRMATION_TOKEN') {
          return 'CONFIRM_ERASE_CHILD_DATA';
        }
        return defaultValue;
      }),
    };

    service = new GuardianService(dataSource, configService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should export complete child data when guardian relationship and token are valid', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          guardian_id: guardianId,
          child_id: childId,
          consent_given_at: '2026-03-01T00:00:00.000Z',
          consent_type: 'COPPA_PARENTAL',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: childId,
          email: 'child@test.com',
          display_name: 'Child A',
          role: 'ROLE_CHILD',
          email_verified: true,
          is_active: true,
        },
      ])
      .mockResolvedValueOnce([{ id: 'profile-1', user_id: childId }])
      .mockResolvedValueOnce([{ id: 'session-1', user_id: childId }])
      .mockResolvedValueOnce([{ id: 1, session_id: 'session-1' }])
      .mockResolvedValueOnce([{ id: 2, session_id: 'session-1' }])
      .mockResolvedValueOnce([{ id: 'token-1', child_id: childId }])
      .mockResolvedValueOnce([{ id: 'redeem-1', child_id: childId }])
      .mockResolvedValueOnce([{ id: 'report-1', child_id: childId }])
      .mockResolvedValueOnce([{ id: 'otp-1', user_id: childId, code: '123456' }]);

    const result = await service.exportChildData(guardianId, childId, 'CONFIRM_EXPORT_CHILD_DATA');

    expect(result.childId).toBe(childId);
    expect(result.exportedByGuardianId).toBe(guardianId);
    expect(result.otpCodes).toEqual([{ id: 'otp-1', user_id: childId, code: '123456' }]);
    expect(result.child.password_hash).toBeUndefined();
    expect(dataSource.query).toHaveBeenCalledTimes(10);
  });

  it('should throw ForbiddenException when guardian has no relationship with child for export', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await expect(
      service.exportChildData(guardianId, childId, 'CONFIRM_EXPORT_CHILD_DATA'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should throw UnauthorizedException for invalid export confirmation token', async () => {
    await expect(service.exportChildData(guardianId, childId, 'WRONG_TOKEN')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('should erase all child data with cascade-safe order and verify zero residual records', async () => {
    const state = {
      users: 1,
      children_profiles: 1,
      guardian_children: 1,
      reading_sessions: 2,
      mouse_events: 5,
      session_replay_events: 4,
      tokens: 3,
      redemptions: 2,
      reports: 1,
      otp_codes: 1,
    };

    queryRunner.manager.query.mockImplementation(async (sql) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized.includes('from guardian_children') && normalized.includes('limit 1')) {
        return state.guardian_children > 0 ? [{ guardian_id: guardianId, child_id: childId }] : [];
      }

      if (normalized.includes('select count(*)::int as count from users')) {
        return [{ count: state.users }];
      }
      if (normalized.includes('select count(*)::int as count from children_profiles')) {
        return [{ count: state.children_profiles }];
      }
      if (
        normalized.includes('select count(*)::int as count from guardian_children') &&
        !normalized.includes('limit 1')
      ) {
        return [{ count: state.guardian_children }];
      }
      if (normalized.includes('select count(*)::int as count from reading_sessions')) {
        return [{ count: state.reading_sessions }];
      }
      if (normalized.includes('select count(*)::int as count from mouse_events')) {
        return [{ count: state.mouse_events }];
      }
      if (normalized.includes('select count(*)::int as count from session_replay_events')) {
        return [{ count: state.session_replay_events }];
      }
      if (normalized.includes('select count(*)::int as count from tokens')) {
        return [{ count: state.tokens }];
      }
      if (normalized.includes('select count(*)::int as count from redemptions')) {
        return [{ count: state.redemptions }];
      }
      if (normalized.includes('select count(*)::int as count from reports')) {
        return [{ count: state.reports }];
      }
      if (normalized.includes('select count(*)::int as count from otp_codes')) {
        return [{ count: state.otp_codes }];
      }

      if (normalized.startsWith('delete from otp_codes')) {
        state.otp_codes = 0;
        return [];
      }
      if (normalized.startsWith('delete from reading_sessions')) {
        state.reading_sessions = 0;
        state.mouse_events = 0;
        state.session_replay_events = 0;
        return [];
      }
      if (normalized.startsWith('delete from tokens')) {
        state.tokens = 0;
        return [];
      }
      if (normalized.startsWith('delete from redemptions')) {
        state.redemptions = 0;
        return [];
      }
      if (normalized.startsWith('delete from reports')) {
        state.reports = 0;
        return [];
      }
      if (normalized.startsWith('delete from guardian_children')) {
        state.guardian_children = 0;
        return [];
      }
      if (normalized.startsWith('delete from children_profiles')) {
        state.children_profiles = 0;
        return [];
      }
      if (normalized.startsWith('delete from users')) {
        state.users = 0;
        return [];
      }

      return [];
    });

    const result = await service.eraseChildData(guardianId, childId, 'CONFIRM_ERASE_CHILD_DATA');

    expect(result.erased).toBe(true);
    expect(result.childId).toBe(childId);
    expect(result.deletedCounts).toEqual({
      users: 1,
      children_profiles: 1,
      guardian_children: 1,
      reading_sessions: 2,
      mouse_events: 5,
      session_replay_events: 4,
      tokens: 3,
      redemptions: 2,
      reports: 1,
      otp_codes: 1,
    });

    expect(state).toEqual({
      users: 0,
      children_profiles: 0,
      guardian_children: 0,
      reading_sessions: 0,
      mouse_events: 0,
      session_replay_events: 0,
      tokens: 0,
      redemptions: 0,
      reports: 0,
      otp_codes: 0,
    });
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('should rollback erase transaction if an error occurs midway', async () => {
    queryRunner.manager.query.mockImplementation(async (sql) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized.includes('from guardian_children') && normalized.includes('limit 1')) {
        return [{ guardian_id: guardianId, child_id: childId }];
      }

      if (normalized.includes('select count(*)::int as count')) {
        return [{ count: 1 }];
      }

      if (normalized.startsWith('delete from tokens')) {
        throw new Error('Simulated DB failure');
      }

      return [];
    });

    await expect(
      service.eraseChildData(guardianId, childId, 'CONFIRM_ERASE_CHILD_DATA'),
    ).rejects.toThrow('Simulated DB failure');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });

  it('should throw ForbiddenException when guardian has no relationship with child for erase', async () => {
    queryRunner.manager.query.mockResolvedValueOnce([]);

    await expect(
      service.eraseChildData(guardianId, childId, 'CONFIRM_ERASE_CHILD_DATA'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should throw UnauthorizedException for invalid erase confirmation token', async () => {
    await expect(service.eraseChildData(guardianId, childId, 'wrong-token')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });
});
