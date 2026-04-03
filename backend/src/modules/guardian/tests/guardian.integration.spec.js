require('reflect-metadata');

const { randomUUID } = require('crypto');
const { AppDataSource } = require('../../../database/data-source');
const { GuardianService } = require('../guardian.service');

const runDbIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const describeDb = runDbIntegration ? describe : describe.skip;

describeDb('GuardianService (DB Integration)', () => {
  let dataSource;
  let service;

  beforeAll(async () => {
    dataSource = AppDataSource;

    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }

    service = new GuardianService(dataSource, {
      get: (key, defaultValue) => {
        if (key === 'GUARDIAN_EXPORT_CONFIRMATION_TOKEN') return 'CONFIRM_EXPORT_CHILD_DATA';
        if (key === 'GUARDIAN_ERASE_CONFIRMATION_TOKEN') return 'CONFIRM_ERASE_CHILD_DATA';
        return defaultValue;
      },
    });
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  async function countRows(table, column, value) {
    const rows = await dataSource.query(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${column} = $1`,
      [value],
    );
    return Number(rows[0]?.count || 0);
  }

  async function seedChildDataset() {
    const guardianId = randomUUID();
    const childId = randomUUID();
    const contentId = randomUUID();
    const sessionId = randomUUID();
    const rewardId = randomUUID();

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    await dataSource.query(
      `
      INSERT INTO users (id, email, password_hash, display_name, role, is_active, email_verified)
      VALUES ($1, $2, $3, $4, 'ROLE_GUARDIAN', true, true)
      `,
      [guardianId, `guardian-${suffix}@test.local`, 'hashed-password', 'Guardian Integration'],
    );

    await dataSource.query(
      `
      INSERT INTO users (id, email, password_hash, display_name, role, is_active, email_verified)
      VALUES ($1, $2, $3, $4, 'ROLE_CHILD', true, true)
      `,
      [childId, `child-${suffix}@test.local`, 'hashed-password', 'Child Integration'],
    );

    await dataSource.query(
      `
      INSERT INTO guardian_children (guardian_id, child_id, consent_given_at, consent_type)
      VALUES ($1, $2, NOW(), 'COPPA_PARENTAL')
      `,
      [guardianId, childId],
    );

    await dataSource.query(
      `
      INSERT INTO children_profiles (id, user_id, grade_level, baseline_json, preferences)
      VALUES ($1, $2, 3, $3::jsonb, $4::jsonb)
      `,
      [randomUUID(), childId, JSON.stringify({ baseline: 0.5 }), JSON.stringify({ fontSize: 16 })],
    );

    await dataSource.query(
      `
      INSERT INTO reading_content (id, title, body, difficulty, age_group, word_count)
      VALUES ($1, 'Integration Content', 'Sample content body', 'EASY', '7-9', 3)
      `,
      [contentId],
    );

    await dataSource.query(
      `
      INSERT INTO reading_sessions (
        id, user_id, content_id, status, ended_at, effort_score, cognitive_state_summary, settings
      )
      VALUES ($1, $2, $3, 'COMPLETED', NOW(), 0.85, $4::jsonb, $5::jsonb)
      `,
      [
        sessionId,
        childId,
        contentId,
        JSON.stringify({ state_counts: { FLUENT: 8, REGRESSION: 2 } }),
        JSON.stringify({ letterSpacing: '0.1em' }),
      ],
    );

    await dataSource.query(
      `
      INSERT INTO mouse_events (session_id, x, y, timestamp, word_index, velocity)
      VALUES ($1, 50, 60, $2, 1, 1.2)
      `,
      [sessionId, Date.now()],
    );

    await dataSource.query(
      `
      INSERT INTO session_replay_events (session_id, event_type, payload, cognitive_state, timestamp)
      VALUES ($1, 'INTERVENTION', $2::jsonb, 'REGRESSION', $3)
      `,
      [sessionId, JSON.stringify({ step: 'tooltip' }), Date.now()],
    );

    await dataSource.query(
      `
      INSERT INTO rewards (id, name, cost, is_active)
      VALUES ($1, 'Integration Reward', 10, true)
      `,
      [rewardId],
    );

    await dataSource.query(
      `
      INSERT INTO tokens (id, child_id, amount, type, reason, effort_score, session_id)
      VALUES ($1, $2, 85, 'EARN', 'INTEGRATION_EARN', 0.85, $3)
      `,
      [randomUUID(), childId, sessionId],
    );

    await dataSource.query(
      `
      INSERT INTO tokens (id, child_id, amount, type, reason, effort_score, session_id)
      VALUES ($1, $2, 20, 'BONUS', 'INTEGRATION_BONUS', 0.85, NULL)
      `,
      [randomUUID(), childId],
    );

    await dataSource.query(
      `
      INSERT INTO redemptions (id, child_id, reward_id, cost)
      VALUES ($1, $2, $3, 10)
      `,
      [randomUUID(), childId, rewardId],
    );

    await dataSource.query(
      `
      INSERT INTO reports (id, child_id, report_type, content, period_start, period_end)
      VALUES ($1, $2, 'WEEKLY', 'Integration report', CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE)
      `,
      [randomUUID(), childId],
    );

    await dataSource.query(
      `
      INSERT INTO otp_codes (id, user_id, code, type, expires_at, used)
      VALUES ($1, $2, '123456', 'EMAIL_VERIFY', NOW() + INTERVAL '10 minutes', false)
      `,
      [randomUUID(), childId],
    );

    return { guardianId, childId, contentId, sessionId, rewardId };
  }

  async function cleanupSeed(seed) {
    const { guardianId, childId, contentId, rewardId } = seed;

    await dataSource.query(`DELETE FROM otp_codes WHERE user_id = $1`, [childId]);
    await dataSource.query(`DELETE FROM redemptions WHERE child_id = $1`, [childId]);
    await dataSource.query(`DELETE FROM tokens WHERE child_id = $1`, [childId]);
    await dataSource.query(`DELETE FROM reports WHERE child_id = $1`, [childId]);
    await dataSource.query(`DELETE FROM reading_sessions WHERE user_id = $1`, [childId]);
    await dataSource.query(
      `DELETE FROM guardian_children WHERE child_id = $1 OR guardian_id = $2`,
      [childId, guardianId],
    );
    await dataSource.query(`DELETE FROM children_profiles WHERE user_id = $1`, [childId]);
    await dataSource.query(`DELETE FROM users WHERE id IN ($1, $2)`, [childId, guardianId]);
    await dataSource.query(`DELETE FROM rewards WHERE id = $1`, [rewardId]);
    await dataSource.query(`DELETE FROM reading_content WHERE id = $1`, [contentId]);
  }

  it('should export full child dataset from real PostgreSQL', async () => {
    const seed = await seedChildDataset();

    try {
      const result = await service.exportChildData(
        seed.guardianId,
        seed.childId,
        'CONFIRM_EXPORT_CHILD_DATA',
      );

      expect(result.childId).toBe(seed.childId);
      expect(result.exportedByGuardianId).toBe(seed.guardianId);
      expect(result.child).toBeDefined();
      expect(result.child.password_hash).toBeUndefined();
      expect(result.profile).toBeDefined();
      expect(result.readingSessions.length).toBeGreaterThan(0);
      expect(result.mouseEvents.length).toBeGreaterThan(0);
      expect(result.sessionReplayEvents.length).toBeGreaterThan(0);
      expect(result.tokens.length).toBeGreaterThan(0);
      expect(result.redemptions.length).toBeGreaterThan(0);
      expect(result.reports.length).toBeGreaterThan(0);
      expect(result.otpCodes.length).toBeGreaterThan(0);
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('should erase all child-related rows from real PostgreSQL with zero residuals', async () => {
    const seed = await seedChildDataset();

    const eraseResult = await service.eraseChildData(
      seed.guardianId,
      seed.childId,
      'CONFIRM_ERASE_CHILD_DATA',
    );

    expect(eraseResult.erased).toBe(true);
    expect(eraseResult.childId).toBe(seed.childId);

    expect(await countRows('users', 'id', seed.childId)).toBe(0);
    expect(await countRows('children_profiles', 'user_id', seed.childId)).toBe(0);
    expect(await countRows('guardian_children', 'child_id', seed.childId)).toBe(0);
    expect(await countRows('reading_sessions', 'user_id', seed.childId)).toBe(0);
    expect(await countRows('tokens', 'child_id', seed.childId)).toBe(0);
    expect(await countRows('redemptions', 'child_id', seed.childId)).toBe(0);
    expect(await countRows('reports', 'child_id', seed.childId)).toBe(0);
    expect(await countRows('otp_codes', 'user_id', seed.childId)).toBe(0);

    await dataSource.query(`DELETE FROM users WHERE id = $1`, [seed.guardianId]);
    await dataSource.query(`DELETE FROM rewards WHERE id = $1`, [seed.rewardId]);
    await dataSource.query(`DELETE FROM reading_content WHERE id = $1`, [seed.contentId]);
  });

  it('should rollback erase transaction on forced mid-flight failure (real DB)', async () => {
    const seed = await seedChildDataset();

    const originalCreateQueryRunner = dataSource.createQueryRunner.bind(dataSource);
    dataSource.createQueryRunner = function patchedCreateQueryRunner() {
      const runner = originalCreateQueryRunner();
      const originalQuery = runner.manager.query.bind(runner.manager);

      runner.manager.query = async (sql, params) => {
        if (/^\s*DELETE\s+FROM\s+tokens\b/i.test(sql)) {
          throw new Error('Forced rollback for integration test');
        }

        return originalQuery(sql, params);
      };

      return runner;
    };

    try {
      await expect(
        service.eraseChildData(seed.guardianId, seed.childId, 'CONFIRM_ERASE_CHILD_DATA'),
      ).rejects.toThrow('Forced rollback for integration test');

      expect(await countRows('users', 'id', seed.childId)).toBe(1);
      expect(await countRows('reading_sessions', 'user_id', seed.childId)).toBe(1);
      expect(await countRows('tokens', 'child_id', seed.childId)).toBeGreaterThan(0);
      expect(await countRows('redemptions', 'child_id', seed.childId)).toBe(1);
    } finally {
      dataSource.createQueryRunner = originalCreateQueryRunner;
      await cleanupSeed(seed);
    }
  });
});
