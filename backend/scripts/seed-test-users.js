/**
 * Seed test users for QA API testing.
 * Creates 3 users: guardian, child, clinician — all verified + active.
 */
const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function seed() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'readease',
    user: process.env.DB_USER || 'readease_app',
    password: process.env.DB_PASSWORD || 'devpassword',
  });

  await client.connect();

  const hash = await bcrypt.hash('Test@12345', 10);
  const now = new Date().toISOString();

  // Valid UUID v4: block3 must start with [1-8], block4 must start with [89ab]
  const GUARDIAN_ID  = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const CHILD_ID     = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const CLINICIAN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const users = [
    { id: GUARDIAN_ID,  email: 'guardian@test.com',  role: 'ROLE_GUARDIAN',  name: 'Test Guardian' },
    { id: CHILD_ID,     email: 'child@test.com',     role: 'ROLE_CHILD',     name: 'Test Child' },
    { id: CLINICIAN_ID, email: 'clinician@test.com', role: 'ROLE_CLINICIAN', name: 'Test Clinician' },
  ];

  // Delete old test users first to allow clean re-insert with new IDs
  await client.query(
    `DELETE FROM users WHERE email = ANY($1::text[]) OR id = ANY($2::uuid[])`,
    [users.map((u) => u.email), users.map((u) => u.id)],
  );
  console.log('Cleared old test users');

  for (const u of users) {
    await client.query(
      `INSERT INTO users (id, email, password_hash, display_name, role, email_verified, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,true,true,$6,$6)`,
      [u.id, u.email, hash, u.name, u.role, now],
    );
    console.log('Seeded:', u.email, '/', u.role);
  }


  // Seed children_profiles for child user (required for token balance queries)
  await client.query(
    `INSERT INTO children_profiles (user_id, created_at, updated_at)
     VALUES ($1, $2, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [CHILD_ID, now],
  );
  console.log('Seeded: children_profiles for', CHILD_ID);

  await client.end();

  console.log('\nAll test users seeded successfully.');
  console.log('IDs:');
  console.log('  GUARDIAN_ID :', GUARDIAN_ID);
  console.log('  CHILD_ID    :', CHILD_ID);
  console.log('  CLINICIAN_ID:', CLINICIAN_ID);
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
