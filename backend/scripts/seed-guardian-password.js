/**
 * Seed script: sets a known password hash for the test guardian account
 * Run: node scripts/seed-guardian-password.js
 */
const bcrypt = require('bcrypt');
const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'readease',
    user: 'readease_app',
    password: 'devpassword',
  });

  await client.connect();

  const password = 'Test@123456';
  const hash = await bcrypt.hash(password, 12);

  // Verify hash is correct before saving
  const verified = await bcrypt.compare(password, hash);
  console.log(`Generated hash verified locally: ${verified}`);

  await client.query(
    'UPDATE users SET password_hash = $1 WHERE email = $2',
    [hash, 'guardian@readease.com'],
  );

  console.log(`Password set for guardian@readease.com`);
  console.log(`Password: ${password}`);
  console.log(`Hash: ${hash}`);

  await client.end();
}

main().catch(console.error);
