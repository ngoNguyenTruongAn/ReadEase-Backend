/**
 * Redis OTP Integration Test Script
 *
 * Tests the full OTP flow against a running local backend.
 * Run AFTER `npm run start:dev` is up.
 *
 * Usage:
 *   node backend/scripts/test-redis-otp.js
 *
 * Prerequisites:
 *   - Backend running on http://localhost:3000
 *   - Redis running and connected
 *   - A test email that doesn't exist yet in the DB
 *     (or set TEST_EMAIL env var)
 */

const http = require('http');

// ── Config ────────────────────────────────────────────────────────────────────
const BASE = 'http://localhost:3000/api/v1/auth';
// Use a timestamp-unique email to avoid conflicts across runs
const TEST_EMAIL = process.env.TEST_EMAIL || `otp_test_${Date.now()}@readease.test`;
const TEST_PASS = 'TestPass@123';

let PASS = 0;
let FAIL = 0;

// ── HTTP helper ───────────────────────────────────────────────────────────────

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(BASE + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function assert(label, condition, extra = '') {
  if (condition) {
    console.log(`  ✅ PASS  ${label}`);
    PASS++;
  } else {
    console.error(`  ❌ FAIL  ${label}${extra ? '  →  ' + extra : ''}`);
    FAIL++;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Test cases ────────────────────────────────────────────────────────────────

async function run() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ReadEase — Redis OTP Integration Tests');
  console.log(`  Target: ${BASE}`);
  console.log(`  Email:  ${TEST_EMAIL}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── TC-1: Register — OTP should be generated and stored in Redis ────────────
  console.log('TC-1  POST /register');
  const reg = await post('/register', {
    email: TEST_EMAIL,
    password: TEST_PASS,
    display_name: 'OTP Test User',
  });
  assert('register returns 201', reg.status === 201, JSON.stringify(reg.body));
  assert('response has email field', reg.body?.email === TEST_EMAIL);
  assert('no tokens yet (pending verification)', !reg.body?.accessToken);

  // ── TC-2: Resend OTP within cooldown window — expect 429 ───────────────────
  console.log('\nTC-2  POST /resend-otp (within 60s cooldown → expect 429)');
  const resend1 = await post('/resend-otp', { email: TEST_EMAIL });
  assert(
    'resend within cooldown returns 429',
    resend1.status === 429,
    `got ${resend1.status}: ${JSON.stringify(resend1.body)}`,
  );
  assert('error message mentions wait time', resend1.body?.message?.includes('wait'));

  // ── TC-3: Verify with wrong code — 5 times to trigger lock ─────────────────
  console.log('\nTC-3  POST /verify-email (5 wrong codes → brute-force lock)');
  const wrongResults = [];
  for (let i = 1; i <= 5; i++) {
    const r = await post('/verify-email', { email: TEST_EMAIL, code: '000000' });
    wrongResults.push(r.status);
    const label = `attempt ${i}/5`;
    if (i < 5) {
      assert(`${label} returns 400`, r.status === 400, JSON.stringify(r.body));
    } else {
      assert(`${label} (5th) triggers 429 lock`, r.status === 429, JSON.stringify(r.body));
    }
  }

  // ── TC-4: After lock, correct code should also be rejected ─────────────────
  console.log('\nTC-4  POST /verify-email (correct code while locked → still 429)');
  // We don't know the real code, but a locked account should reject everything
  const locked = await post('/verify-email', { email: TEST_EMAIL, code: '123456' });
  assert(
    'locked account returns 429 even with any code',
    locked.status === 429,
    JSON.stringify(locked.body),
  );

  // ── TC-5: Register a second fresh user to test the correct-code happy path ──
  console.log('\nTC-5  Full happy-path (second fresh user)');
  const EMAIL2 = `otp_happy_${Date.now()}@readease.test`;

  const reg2 = await post('/register', {
    email: EMAIL2,
    password: TEST_PASS,
    display_name: 'Happy Path User',
  });
  assert('second register returns 201', reg2.status === 201);

  // In DEV mode the OTP is printed to the server log.
  // We cannot read it programmatically here without Redis CLI or log scraping,
  // so we verify the endpoint responses instead.
  console.log(
    '  ℹ️  To complete TC-5, grab the OTP from the server console/log and run:',
  );
  console.log(`     POST /api/v1/auth/verify-email  { email: "${EMAIL2}", code: "<OTP>" }`);
  console.log('     Expected: 200 with accessToken + refreshToken\n');

  // ── TC-6: Forgot password flow ───────────────────────────────────────────────
  console.log('TC-6  POST /forgot-password (registered but unverified user)');
  // Use a non-existent email — server should return generic 200 (no info leak)
  const fp = await post('/forgot-password', { email: `noexist_${Date.now()}@readease.test` });
  assert(
    'forgot-password non-existent email returns 200 (no info leak)',
    fp.status === 200,
    JSON.stringify(fp.body),
  );
  assert('generic message returned', fp.body?.message?.includes('OTP'));

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  Results: ${PASS} passed, ${FAIL} failed`);
  console.log('═══════════════════════════════════════════════════════════');

  if (FAIL > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\n🔴 Script error:', err.message);
  console.error('   Is the backend running?  →  npm run start:dev');
  process.exit(1);
});
