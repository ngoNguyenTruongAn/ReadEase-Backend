#!/usr/bin/env node
/**
 * Seed manual demo data from scratch/manual-test-assets/readease-manual-test-script.md.
 *
 * This script is intentionally idempotent:
 * - Users are upserted by email.
 * - Guardian-child links are inserted if missing.
 * - Reading sessions created by this script are replaced on each run.
 * - The 100-token child bonus created by this script is replaced on each run.
 *
 * It does not create weekly reports.
 */
const bcrypt = require('bcrypt');
const { Client } = require('pg');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const SEED_SOURCE = 'manual-demo-seed';
const PASSWORD = 'ReadEase@2026';
const BONUS_REASON = 'Manual demo seed: 100 starting tokens';

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function getDbConfig() {
  const configuredHost = process.env.DB_HOST || 'localhost';
  const runningInDocker = fs.existsSync('/.dockerenv');
  const host = configuredHost === 'postgres' && !runningInDocker ? 'localhost' : configuredHost;

  return {
    host,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || process.env.POSTGRES_DB || 'readease',
    user: process.env.DB_USER || process.env.POSTGRES_USER || 'readease_app',
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'devpassword',
  };
}

const accounts = [
  {
    key: 'minhAnh',
    pair: 1,
    role: 'ROLE_CHILD',
    displayName: 'Nguyen Minh Anh',
    email: 'minhanh.nguyen150526@gmail.com',
    gradeLevel: 1,
    dateOfBirth: '2018-09-05',
    scenario: 'IMPROVING',
    scenarioLabel: 'Co cai thien ro ret',
    effortScores: [0.52, 0.61, 0.7, 0.78, 0.86, 0.91],
  },
  {
    key: 'lanNguyen',
    pair: 1,
    role: 'ROLE_GUARDIAN',
    displayName: 'Nguyen Thi Lan',
    email: 'lan.nguyen150526@gmail.com',
  },
  {
    key: 'baoNam',
    pair: 2,
    role: 'ROLE_CHILD',
    displayName: 'Tran Bao Nam',
    email: 'baonam.tran150526@gmail.com',
    gradeLevel: 2,
    dateOfBirth: '2017-06-12',
    scenario: 'FLAT',
    scenarioLabel: 'Khong cai thien',
    effortScores: [0.62, 0.61, 0.63, 0.6, 0.62, 0.61],
  },
  {
    key: 'huyTran',
    pair: 2,
    role: 'ROLE_GUARDIAN',
    displayName: 'Tran Quoc Huy',
    email: 'huy.tran150526@gmail.com',
  },
  {
    key: 'haMy',
    pair: 3,
    role: 'ROLE_CHILD',
    displayName: 'Le Ha My',
    email: 'hamy.le150526@gmail.com',
    gradeLevel: 3,
    dateOfBirth: '2016-03-22',
    scenario: 'DECLINING',
    scenarioLabel: 'Giam lien tuc',
    effortScores: [0.84, 0.76, 0.67, 0.58, 0.49, 0.4],
  },
  {
    key: 'huongLe',
    pair: 3,
    role: 'ROLE_GUARDIAN',
    displayName: 'Le Thu Huong',
    email: 'huong.le150526@gmail.com',
  },
  {
    key: 'giaBao',
    pair: 4,
    role: 'ROLE_CHILD',
    displayName: 'Pham Gia Bao',
    email: 'giabao.pham150526@gmail.com',
    gradeLevel: 4,
    dateOfBirth: '2015-11-18',
    scenario: 'MIXED',
    scenarioLabel: 'Luc tang luc giam',
    effortScores: [0.5, 0.72, 0.55, 0.8, 0.58, 0.74],
  },
  {
    key: 'quanPham',
    pair: 4,
    role: 'ROLE_GUARDIAN',
    displayName: 'Pham Minh Quan',
    email: 'quan.pham150526@gmail.com',
  },
  {
    key: 'drKhoa',
    role: 'ROLE_CLINICIAN',
    displayName: 'Dr. Tran Minh Khoa',
    email: 'dr.khoa.tran150526@gmail.com',
  },
];

function getStateCounts(scenario, effortScore) {
  const fluent = Math.round(12 + effortScore * 36);
  let regression;
  let distraction;

  if (scenario === 'FLAT') {
    regression = 16 + Math.round((0.63 - effortScore) * 20);
    distraction = 10;
  } else if (scenario === 'MIXED') {
    regression = Math.round(28 - effortScore * 20);
    distraction = Math.round(15 - effortScore * 8);
  } else {
    regression = Math.round(31 - effortScore * 24);
    distraction = Math.round(18 - effortScore * 12);
  }

  return {
    FLUENT: Math.max(8, fluent),
    REGRESSION: Math.max(3, regression),
    DISTRACTION: Math.max(2, distraction),
  };
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function round4(value) {
  return Number(value.toFixed(4));
}

async function upsertUser(client, account, passwordHash) {
  const result = await client.query(
    `
    INSERT INTO users (
      email,
      password_hash,
      display_name,
      role,
      email_verified,
      is_active,
      guardian_invite_code,
      guardian_invite_code_expires_at,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, true, true, NULL, NULL, NOW(), NOW())
    ON CONFLICT (email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          display_name = EXCLUDED.display_name,
          role = EXCLUDED.role,
          email_verified = true,
          is_active = true,
          guardian_invite_code = NULL,
          guardian_invite_code_expires_at = NULL,
          updated_at = NOW(),
          deleted_at = NULL
    RETURNING id
    `,
    [account.email, passwordHash, account.displayName, account.role],
  );

  account.id = result.rows[0].id;
}

async function upsertChildProfile(client, child) {
  await client.query(
    `
    INSERT INTO children_profiles (
      user_id,
      date_of_birth,
      grade_level,
      baseline_json,
      preferences,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE
      SET date_of_birth = EXCLUDED.date_of_birth,
          grade_level = EXCLUDED.grade_level,
          baseline_json = EXCLUDED.baseline_json,
          preferences = EXCLUDED.preferences,
          updated_at = NOW()
    `,
    [
      child.id,
      child.dateOfBirth,
      child.gradeLevel,
      JSON.stringify({
        source: SEED_SOURCE,
        scenario: child.scenario,
        scenarioLabel: child.scenarioLabel,
      }),
      JSON.stringify({
        theme: 'demo',
        assistive_reading: true,
      }),
    ],
  );
}

async function linkGuardianPairs(client) {
  const children = accounts.filter((account) => account.role === 'ROLE_CHILD');

  for (const child of children) {
    const guardian = accounts.find(
      (account) => account.role === 'ROLE_GUARDIAN' && account.pair === child.pair,
    );

    await client.query(
      `
      INSERT INTO guardian_children (guardian_id, child_id, consent_given_at, consent_type)
      VALUES ($1, $2, NOW(), 'COPPA_PARENTAL')
      ON CONFLICT (guardian_id, child_id) DO UPDATE
        SET consent_given_at = EXCLUDED.consent_given_at,
            consent_type = EXCLUDED.consent_type
      `,
      [guardian.id, child.id],
    );
  }
}

async function getContents(client) {
  const result = await client.query(
    `
    SELECT id, title, word_count
    FROM reading_content
    WHERE deleted_at IS NULL
    ORDER BY title ASC
    `,
  );

  if (result.rows.length === 0) {
    throw new Error('No reading_content rows found. Seed stories before seeding reading sessions.');
  }

  return result.rows;
}

async function clearPriorSeedRows(client, childIds) {
  await client.query(
    `
    DELETE FROM tokens
    WHERE child_id = ANY($1::uuid[])
      AND reason = $2
    `,
    [childIds, BONUS_REASON],
  );

  const priorSessions = await client.query(
    `
    SELECT id
    FROM reading_sessions
    WHERE user_id = ANY($1::uuid[])
      AND settings->>'source' = $2
    `,
    [childIds, SEED_SOURCE],
  );

  const sessionIds = priorSessions.rows.map((row) => row.id);
  if (sessionIds.length === 0) return;

  await client.query('DELETE FROM tokens WHERE session_id = ANY($1::uuid[])', [sessionIds]);
  await client.query('DELETE FROM reading_sessions WHERE id = ANY($1::uuid[])', [sessionIds]);
}

async function insertStartingBonus(client, child) {
  await client.query(
    `
    INSERT INTO tokens (child_id, amount, type, reason, effort_score, session_id, created_at)
    VALUES ($1, 100, 'BONUS', $2, NULL, NULL, NOW())
    `,
    [child.id, BONUS_REASON],
  );
}

async function insertReplayEvents(client, sessionId, counts, effortScore) {
  const events = [];
  const stateOrder = ['FLUENT', 'REGRESSION', 'DISTRACTION'];
  let cursor = 0;

  for (const state of stateOrder) {
    for (let i = 0; i < counts[state]; i += 1) {
      const wordIndex = cursor % 90;
      const isRegression = state === 'REGRESSION';
      const dwellMs =
        state === 'FLUENT' ? 220 + i * 3 : state === 'REGRESSION' ? 620 + i * 9 : 900 + i * 12;
      const interventionType =
        state === 'FLUENT' ? null : state === 'REGRESSION' ? 'HIGHLIGHT' : 'PROMPT';

      events.push([
        sessionId,
        'mouse_move',
        JSON.stringify({
          source: SEED_SOURCE,
          wordIndex,
          dwellMs,
          isRegression,
          confidence: round4(0.72 + effortScore * 0.22),
        }),
        state,
        interventionType,
        cursor * 750,
      ]);
      cursor += 1;
    }
  }

  for (const event of events) {
    await client.query(
      `
      INSERT INTO session_replay_events (
        session_id,
        event_type,
        payload,
        cognitive_state,
        intervention_type,
        timestamp,
        created_at
      )
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, NOW())
      `,
      event,
    );
  }
}

async function insertMouseEvents(client, sessionId, counts, effortScore) {
  const totalEvents = counts.FLUENT + counts.REGRESSION + counts.DISTRACTION;

  for (let i = 0; i < totalEvents; i += 1) {
    const regressionZone = i >= counts.FLUENT && i < counts.FLUENT + counts.REGRESSION;
    const distractionZone = i >= counts.FLUENT + counts.REGRESSION;
    const velocity = regressionZone ? 0.28 + effortScore * 0.15 : 0.55 + effortScore * 0.35;
    const dwellTime = distractionZone ? 1.2 : regressionZone ? 0.82 : 0.36;

    await client.query(
      `
      INSERT INTO mouse_events (
        session_id,
        x,
        y,
        timestamp,
        word_index,
        velocity,
        acceleration,
        curvature,
        dwell_time,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `,
      [
        sessionId,
        120 + ((i * 23) % 680),
        180 + ((i * 11) % 360),
        i * 750,
        i % 90,
        round4(velocity),
        round4(0.08 + effortScore * 0.04),
        round4(regressionZone ? 0.42 : 0.16),
        round4(dwellTime),
      ],
    );
  }
}

async function insertReadingSessions(client, child, contents, baseDate) {
  for (let index = 0; index < child.effortScores.length; index += 1) {
    const effortScore = child.effortScores[index];
    const content = contents[(child.pair + index) % contents.length];
    const counts = getStateCounts(child.scenario, effortScore);
    const totalEvents = counts.FLUENT + counts.REGRESSION + counts.DISTRACTION;
    const start = addDays(baseDate, index);
    const durationMinutes = Math.round(9 + effortScore * 14);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    const sessionId = randomUUID();

    await client.query(
      `
      INSERT INTO reading_sessions (
        id,
        user_id,
        content_id,
        status,
        started_at,
        ended_at,
        effort_score,
        cognitive_state_summary,
        settings,
        created_at
      )
      VALUES ($1, $2, $3, 'COMPLETED', $4, $5, $6, $7::jsonb, $8::jsonb, $4)
      `,
      [
        sessionId,
        child.id,
        content.id,
        start,
        end,
        effortScore,
        JSON.stringify({
          source: SEED_SOURCE,
          scenario: child.scenario,
          scenarioLabel: child.scenarioLabel,
          total_events: totalEvents,
          state_counts: counts,
          confidence_avg: round4(0.72 + effortScore * 0.22),
          effort_score: effortScore,
        }),
        JSON.stringify({
          source: SEED_SOURCE,
          scenario: child.scenario,
          scenarioLabel: child.scenarioLabel,
          sequence: index + 1,
          demoNote: 'Seeded only for analytics/report demo; report rows are not generated.',
        }),
      ],
    );

    await insertReplayEvents(client, sessionId, counts, effortScore);
    await insertMouseEvents(client, sessionId, counts, effortScore);
  }
}

async function summarize(client, childIds) {
  const result = await client.query(
    `
    WITH seeded_sessions AS (
      SELECT user_id, COUNT(*)::int AS session_count
      FROM reading_sessions
      WHERE settings->>'source' = $1
      GROUP BY user_id
    ),
    token_balances AS (
      SELECT
        child_id,
        COALESCE(SUM(CASE WHEN reason = $2 THEN amount END), 0)::int AS seed_bonus_tokens,
        COALESCE(SUM(amount), 0)::int AS total_token_balance
      FROM tokens
      GROUP BY child_id
    )
    SELECT
      u.email,
      u.display_name,
      COALESCE(ss.session_count, 0)::int AS session_count,
      COALESCE(tb.seed_bonus_tokens, 0)::int AS seed_bonus_tokens,
      COALESCE(tb.total_token_balance, 0)::int AS total_token_balance
    FROM users u
    LEFT JOIN seeded_sessions ss ON ss.user_id = u.id
    LEFT JOIN token_balances tb ON tb.child_id = u.id
    WHERE u.id = ANY($3::uuid[])
    ORDER BY u.display_name
    `,
    [SEED_SOURCE, BONUS_REASON, childIds],
  );

  return result.rows;
}

async function main() {
  loadEnv();
  const client = new Client(getDbConfig());
  await client.connect();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const children = accounts.filter((account) => account.role === 'ROLE_CHILD');
  const guardians = accounts.filter((account) => account.role === 'ROLE_GUARDIAN');

  try {
    await client.query('BEGIN');

    for (const account of accounts) {
      await upsertUser(client, account, passwordHash);
    }

    for (const child of children) {
      await upsertChildProfile(client, child);
    }

    await linkGuardianPairs(client);

    const childIds = children.map((child) => child.id);
    await clearPriorSeedRows(client, childIds);

    const contents = await getContents(client);
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - 6);
    baseDate.setHours(9, 0, 0, 0);

    for (const child of children) {
      await insertStartingBonus(client, child);
      await insertReadingSessions(client, child, contents, baseDate);
    }

    await client.query('COMMIT');

    const summary = await summarize(client, childIds);

    console.log('\nManual demo data seeded successfully.');
    console.log(`Password for all seeded accounts: ${PASSWORD}`);
    console.log('\nUsers:');
    for (const account of accounts) {
      console.log(`- ${account.role}: ${account.displayName} <${account.email}>`);
    }

    console.log('\nLinked guardian-child pairs:');
    for (const child of children) {
      const guardian = guardians.find((account) => account.pair === child.pair);
      console.log(`- ${guardian.email} -> ${child.email} (${child.scenarioLabel})`);
    }

    console.log('\nChild seed summary:');
    console.table(summary);
    console.log('\nNo report rows were created.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Manual demo seed failed:', error);
  process.exit(1);
});
