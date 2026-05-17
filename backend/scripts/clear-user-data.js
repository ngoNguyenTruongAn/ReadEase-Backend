/**
 * Clear all user-owned data so demo/test users can be seeded from scratch.
 *
 * Usage:
 *   npm run seed:clear-users
 *
 * This intentionally keeps:
 *   - reading_content
 *   - rewards
 *   - migrations
 *
 * It deletes:
 *   users and all user/session/report/token/replay data.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

function getDbConfig() {
  const configuredHost = process.env.DB_HOST || 'localhost';
  const runningInDocker = fs.existsSync('/.dockerenv');
  const host = configuredHost === 'postgres' && !runningInDocker ? 'localhost' : configuredHost;

  return {
    host,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || process.env.POSTGRES_DB || 'readease',
    user: process.env.DB_USER || process.env.POSTGRES_USER || 'readease_app',
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'devpassword',
  };
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
    ) AS exists
    `,
    [tableName],
  );

  return Boolean(result.rows[0]?.exists);
}

async function countTable(client, tableName) {
  if (!(await tableExists(client, tableName))) return null;
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return result.rows[0].count;
}

async function deleteIfExists(client, tableName, sql) {
  if (!(await tableExists(client, tableName))) {
    return { tableName, deleted: null };
  }

  const result = await client.query(sql);
  return { tableName, deleted: result.rowCount };
}

async function main() {
  const client = new Client(getDbConfig());
  await client.connect();

  const before = {};
  const trackedTables = [
    'users',
    'children_profiles',
    'guardian_children',
    'reading_sessions',
    'session_replay_events',
    'mouse_events',
    'reports',
    'tokens',
    'redemptions',
    'otp_codes',
  ];

  try {
    for (const tableName of trackedTables) {
      before[tableName] = await countTable(client, tableName);
    }

    await client.query('BEGIN');

    const deletions = [];

    deletions.push(
      await deleteIfExists(client, 'redemptions', 'DELETE FROM redemptions'),
    );
    deletions.push(await deleteIfExists(client, 'tokens', 'DELETE FROM tokens'));
    deletions.push(await deleteIfExists(client, 'reports', 'DELETE FROM reports'));
    deletions.push(
      await deleteIfExists(client, 'mouse_events', 'DELETE FROM mouse_events'),
    );
    deletions.push(
      await deleteIfExists(
        client,
        'session_replay_events',
        'DELETE FROM session_replay_events',
      ),
    );
    deletions.push(
      await deleteIfExists(client, 'reading_sessions', 'DELETE FROM reading_sessions'),
    );
    deletions.push(
      await deleteIfExists(client, 'guardian_children', 'DELETE FROM guardian_children'),
    );
    deletions.push(
      await deleteIfExists(client, 'children_profiles', 'DELETE FROM children_profiles'),
    );
    deletions.push(await deleteIfExists(client, 'otp_codes', 'DELETE FROM otp_codes'));
    deletions.push(await deleteIfExists(client, 'users', 'DELETE FROM users'));

    await client.query('COMMIT');

    console.log('User-owned data cleared.');
    console.log('\nBefore:');
    for (const [tableName, count] of Object.entries(before)) {
      if (count !== null) console.log(`  ${tableName}: ${count}`);
    }

    console.log('\nDeleted:');
    for (const item of deletions) {
      if (item.deleted !== null) console.log(`  ${item.tableName}: ${item.deleted}`);
    }

    console.log('\nKept tables: reading_content, rewards, migrations.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Clear user data failed:', error);
  process.exit(1);
});
