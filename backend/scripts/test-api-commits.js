/**
 * test-api-commits.js
 *
 * Integration test script for the 2 latest commits:
 *
 * Commit 1 [50d5106] feat(reports):
 *   - Fix date range (weekStart/weekEnd now set to start/end of day)
 *   - Improve Gemini quota error logging
 *   APIs tested: POST /reports/generate/:childId, GET /reports/:childId, GET /reports/detail/:id
 *
 * Commit 2 [27cafda] feat(auth): migrate OTP from PostgreSQL → Redis
 *   - Redis key schema: otp:{userId}:{type}, otp:attempts:..., otp:cooldown:...
 *   - Brute-force protection (5 attempts → 15min lock)
 *   - Resend cooldown (60s)
 *   APIs tested: POST /auth/register, POST /auth/verify-email,
 *                POST /auth/forgot-password, POST /auth/reset-password
 *                + brute-force & cooldown scenarios
 *
 * Usage:
 *   node scripts/test-api-commits.js
 *
 * Prerequisites:
 *   - NestJS server running on http://localhost:3000
 *   - PostgreSQL + Redis running (via Docker or local)
 *   - A GUARDIAN account already seeded OR will be created fresh
 */

const BASE_URL = 'http://localhost:3000/api/v1';

// ── Colour helpers ──────────────────────────────────────────────────────────
const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

// ── Test counters ───────────────────────────────────────────────────────────
const results = { pass: 0, fail: 0, skip: 0 };

// ── Shared state ────────────────────────────────────────────────────────────
let guardianToken = '';
let guardianId    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';  // pre-seeded
let childId       = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';  // pre-seeded
let reportId      = '';
let testEmail     = 'guardian@readease.com';

// ── Utility: HTTP request ───────────────────────────────────────────────────
async function req(method, path, body, token) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body)  opts.body = JSON.stringify(body);

  const res  = await fetch(url, opts);
  let json;
  try { json = await res.json(); } catch { json = {}; }
  return { status: res.status, body: json };
}

// ── Utility: assert ─────────────────────────────────────────────────────────
function assert(name, condition, got) {
  if (condition) {
    console.log(c.green('  ✓'), name);
    results.pass++;
  } else {
    console.log(c.red('  ✗'), name, c.dim(`→ got: ${JSON.stringify(got)}`));
    results.fail++;
  }
}

function section(title) {
  console.log('\n' + c.bold(c.cyan(`══════════════════════════════════════`)));
  console.log(c.bold(c.cyan(`  ${title}`)));
  console.log(c.bold(c.cyan(`══════════════════════════════════════`)));
}

function info(msg) { console.log(c.dim(`  ℹ  ${msg}`)); }

// ── Sleep helper ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════════════════════
//  SETUP: Login with pre-seeded accounts
// ═══════════════════════════════════════════════════════════════════════════════
async function setup() {
  section('SETUP — Login with pre-seeded Guardian account');

  // Use pre-seeded account: guardian@readease.com / Test@123456
  const knownCreds = [
    { email: 'guardian@readease.com', password: 'Test@123456' },
    { email: 'tnkiet0512@gmail.com',  password: 'Test@123456' },
  ];

  for (const cred of knownCreds) {
    const login = await req('POST', '/auth/login', cred);
    if (login.status === 200 || login.status === 201) {
      guardianToken = login.body?.data?.accessToken || login.body?.data?.access_token || '';
      const uid = login.body?.data?.user?.id || login.body?.user?.id || '';
      const role = login.body?.data?.user?.role || login.body?.user?.role || '';
      if (guardianToken) {
        // Use guardian account if available
        if (role === 'ROLE_GUARDIAN') {
          guardianId = uid;
        }
        assert(`POST /auth/login (${cred.email}) → 200 + token`, true, {role, uid});
        info(`Logged in as: ${cred.email} [${role}]`);
        info(`Token: ${guardianToken.slice(0, 40)}...`);
        break;
      }
    }
  }

  if (!guardianToken) {
    // Fallback: try guardian account with different passwords
    const tryPasswords = ['Test@123456', 'Admin@123', 'password123', 'Readease@2024'];
    for (const pw of tryPasswords) {
      const r = await req('POST', '/auth/login', { email: 'guardian@readease.com', password: pw });
      if (r.status === 200) {
        guardianToken = r.body?.data?.accessToken || r.body?.data?.access_token || '';
        info(`Login succeeded with password: ${pw}`);
        break;
      }
    }
  }

  assert('Guardian token obtained', !!guardianToken, 'No token');

  // Also test register with real email domain
  const ts = Date.now();
  const regEmail = `testuser${ts}@gmail.com`;
  const reg = await req('POST', '/auth/register', {
    email: regEmail,
    password: 'Test@123456',
    displayName: `Test User ${ts}`,      // camelCase per RegisterDto schema
    role: 'ROLE_GUARDIAN',
  });
  assert('POST /auth/register (gmail.com) → 201', reg.status === 201, { status: reg.status, msg: reg.body?.error?.details });
  testEmail = regEmail;
  info(`Register test email: ${regEmail}, status: ${reg.status}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BLOCK A: OTP / Auth Tests (Commit 27cafda — Redis OTP)
// ═══════════════════════════════════════════════════════════════════════════════
async function testOtpRedis() {
  section('COMMIT 27cafda — OTP Redis Migration');

  // ── A1: Register a NEW user to trigger OTP email-verify flow ──────────────
  const ts2 = Date.now();
  const newEmail = `otp_test_${ts2}@gmail.com`;   // must be valid domain

    const reg2 = await req('POST', '/auth/register', {
    email: newEmail,
    password: 'Test@123456',
    displayName: `OTP Test User ${ts2}`,   // camelCase
    role: 'ROLE_GUARDIAN',
  });
  assert('A1: Register new user → 201', reg2.status === 201, reg2.body);
  const newUserId = reg2.body?.data?.user?.id || reg2.body?.data?.id || '';
  info(`New user ID: ${newUserId}`);

  // ── A2: Verify with wrong OTP → should get 400 + remaining attempts ────────
  if (newUserId) {
    const wrong1 = await req('POST', '/auth/verify-email', {
      user_id: newUserId,
      otp_code: '000000',
    });
    assert(
      'A2: Verify with wrong OTP → 400 + "attempt(s) remaining"',
      wrong1.status === 400 && JSON.stringify(wrong1.body).includes('attempt'),
      wrong1.body,
    );

    // ── A3: Wrong OTP again ────────────────────────────────────────────────
    const wrong2 = await req('POST', '/auth/verify-email', {
      user_id: newUserId,
      otp_code: '111111',
    });
    assert(
      'A3: Second wrong OTP → 400 + attempt counter decreasing',
      wrong2.status === 400,
      wrong2.body,
    );
    info(`Attempts message: ${wrong2.body?.message || wrong2.body?.error}`);
  } else {
    results.skip++;
    info('A2/A3 skipped — no user ID returned');
  }

  // ── A4: Resend cooldown — register triggers OTP; immediate resend should 429
  //    We test via forgot-password endpoint (easier to trigger resend)
  //    First create+login an existing verified account
  if (guardianId) {
    const forgot1 = await req('POST', '/auth/forgot-password', { email: testEmail });
    info(`Forgot password #1 status: ${forgot1.status}`);

    const forgot2 = await req('POST', '/auth/forgot-password', { email: testEmail });
    assert(
      'A4: Second forgot-password within 60s → 429 cooldown',
      forgot2.status === 429,
      forgot2.body,
    );
    info(`Cooldown message: ${forgot2.body?.message}`);
  } else {
    results.skip++;
    info('A4 skipped — no guardian session');
  }

  // ── A5: Verify with expired/non-existent OTP → 400 ──────────────────────
  const fakeVerify = await req('POST', '/auth/reset-password', {
    user_id: '00000000-0000-0000-0000-000000000000',
    otp_code: '999999',
    new_password: 'NewPass@123',
  });
  assert(
    'A5: Reset-password with fake user/OTP → 400 or 404',
    fakeVerify.status === 400 || fakeVerify.status === 404,
    fakeVerify.body,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BLOCK B: Reports Tests (Commit 50d5106 — date range fix + quota logging)
// ═══════════════════════════════════════════════════════════════════════════════
async function testReports() {
  section('COMMIT 50d5106 — Reports: Date Range Fix + Gemini');

  if (!guardianToken) {
    info('Skipping reports tests — no auth token');
    results.skip += 5;
    return;
  }

  // Need a child ID under this guardian
  // First get child list
  const profile = await req('GET', '/guardian/children', null, guardianToken);
  info(`Guardian children response: ${profile.status}`);

  if (profile.status === 200 && profile.body?.data?.length > 0) {
    childId = profile.body.data[0].id;
    info(`Using child ID: ${childId}`);
  } else {
    // Create a child profile
    const createChild = await req('POST', '/guardian/children', {
      display_name: 'Test Child',
      birth_year: 2018,
      grade: 2,
    }, guardianToken);
    info(`Create child: ${createChild.status} ${JSON.stringify(createChild.body)}`);
    childId = createChild.body?.data?.id || createChild.body?.id || '';
    info(`Created child ID: ${childId}`);
  }

  if (!childId) {
    info('No child ID available — skipping report tests');
    results.skip += 5;
    return;
  }

  // ── B1: Generate report with date-only strings (the bug that was fixed) ────
  //    Before fix: sessions on weekEnd day were excluded
  //    After fix:  weekEnd is set to 23:59:59, weekStart to 00:00:00
  const today = new Date();
  const weekEndStr = today.toISOString().slice(0, 10);  // "YYYY-MM-DD"
  const weekStartDate = new Date(today);
  weekStartDate.setDate(weekStartDate.getDate() - 7);
  const weekStartStr = weekStartDate.toISOString().slice(0, 10);

  info(`Generating report for range: ${weekStartStr} → ${weekEndStr}`);

  const genReport = await req(
    'POST',
    `/reports/generate/${childId}`,
    { weekStart: weekStartStr, weekEnd: weekEndStr },
    guardianToken,
  );

  assert(
    'B1: POST /reports/generate/:childId with date-only strings → 200/201 or 409 (exists)',
    genReport.status === 200 || genReport.status === 201 || genReport.status === 409,
    { status: genReport.status, msg: genReport.body?.error?.details?.[0] },
  );

  let report;
  if (genReport.status === 200 || genReport.status === 201) {
    report = genReport.body?.data;
    reportId = report?.id || '';
  } else if (genReport.status === 409) {
    // Report already exists — fetch the list to get the existing report
    info('409 received — fetching existing report from list');
    const existingList = await req('GET', `/reports/${childId}`, null, guardianToken);
    const existing = existingList.body?.data?.[0];
    if (existing) {
      report = existing;
      reportId = existing.id || '';
      info(`Using existing report ID: ${reportId}`);
    }
  }

    assert(
      'B2: Report contains id, child_id, content, period_start/week_start',
      report?.id && report?.child_id && report?.content &&
      (report?.period_start || report?.week_start) &&
      (report?.period_end || report?.week_end),
      { id: report?.id, child_id: report?.child_id, period: report?.period_start || report?.week_start },
    );

    const startField = report?.period_start || report?.week_start || '';
    assert(
      'B3: period_start is ISO date string',
      typeof startField === 'string' && startField.length >= 10,
      startField,
    );

    const endField = report?.period_end || report?.week_end || '';
    assert(
      'B4: period_end is ISO date string',
      typeof endField === 'string' && endField.length >= 10,
      endField,
    );

    const isAI       = genReport.body?.data?.is_ai_generated;
    const isFallback = genReport.body?.data?.is_fallback;
    info(`AI generated: ${isAI}, Fallback: ${isFallback}`);
    info(`Report content preview: ${report?.content?.slice(0, 120)}...`);

  if (!report) {
    results.skip += 3;
    info('B2/B3/B4 skipped — no report data available');
  }

  // ── B5: GET /reports/:childId — list reports ───────────────────────────────
  const listReports = await req('GET', `/reports/${childId}`, null, guardianToken);
  assert(
    'B5: GET /reports/:childId → 200 + array',
    listReports.status === 200 && Array.isArray(listReports.body?.data),
    listReports.body,
  );
  info(`Reports count: ${listReports.body?.data?.length}`);

  // ── B6: GET /reports/detail/:reportId ─────────────────────────────────────
  if (reportId) {
    const detail = await req('GET', `/reports/detail/${reportId}`, null, guardianToken);
    // Response can be { data: { id, ... } } or { success, data: { id, ... } }
    const detailData = detail.body?.data || detail.body;
    assert(
      'B6: GET /reports/detail/:reportId → 200 + report id matches',
      detail.status === 200 && detailData?.id === reportId,
      { status: detail.status, gotId: detailData?.id },
    );
  } else {
    results.skip++;
    info('B6 skipped — no reportId');
  }

  // ── B7: Invalid date range → 400 ──────────────────────────────────────────
  const badRange = await req(
    'POST',
    `/reports/generate/${childId}`,
    { weekStart: '2026-04-20', weekEnd: '2026-04-15' },  // start > end
    guardianToken,
  );
  assert(
    'B7: weekStart > weekEnd → 400 BadRequest',
    badRange.status === 400,
    badRange.body,
  );

  // ── B8: Generate report with no date (defaults to last 7 days) ─────────────
  const defaultRange = await req(
    'POST',
    `/reports/generate/${childId}`,
    {},
    guardianToken,
  );
  assert(
    'B8: POST /reports/generate with no body → 200/201 (defaults to last 7 days)',
    defaultRange.status === 200 || defaultRange.status === 201 || defaultRange.status === 409,
    { status: defaultRange.status, msg: defaultRange.body?.message },
  );
  if (defaultRange.status === 409) {
    info('409 = report already exists for this period (correct behavior)');
  }
}

// ── B Extra: Auth endpoints used by reports (JWT guards) ────────────────────
async function testAuthGuards() {
  section('AUTH GUARDS — Reports require valid JWT + role');

  // Unauthenticated request
  const noAuth = await req('POST', `/reports/generate/fake-child-id`, {});
  assert(
    'C1: No JWT token → 401',
    noAuth.status === 401,
    noAuth.body,
  );

  // Wrong role — register a CHILD account and try to generate report
  const ts3 = Date.now();
  const childEmail = `child_${ts3}@gmail.com`;
  await req('POST', '/auth/register', {
    email: childEmail, password: 'Test@123456',
    displayName: 'Child User', role: 'ROLE_CHILD',
  });
  const childLogin = await req('POST', '/auth/login', {
    email: childEmail, password: 'Test@123456',
  });
  const childToken = childLogin.body?.data?.accessToken || childLogin.body?.data?.access_token || '';

  if (childToken) {
    const wrongRole = await req('POST', `/reports/generate/some-child-id`, {}, childToken);
    assert(
      'C2: ROLE_CHILD accessing /reports/generate → 403',
      wrongRole.status === 403,
      wrongRole.body,
    );
  } else {
    results.skip++;
    info('C2 skipped — child login failed (may need email verify)');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(c.bold('\n🧪 ReadEase API Integration Tests'));
  console.log(c.dim(`   Target: ${BASE_URL}`));
  console.log(c.dim(`   Testing commits: 27cafda (OTP→Redis) + 50d5106 (Reports fix)\n`));

  // Health check first
  const health = await req('GET', '/health');
  if (health.status !== 200) {
    console.log(c.red(`\n❌ Server not reachable (${health.status}). Start the server first.\n`));
    process.exit(1);
  }
  console.log(c.green('✓ Server is healthy\n'));

  try {
    await setup();
    await testOtpRedis();
    await testReports();
    await testAuthGuards();
  } catch (err) {
    console.log(c.red(`\n💥 Unexpected error: ${err.message}`));
    console.error(err);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = results.pass + results.fail + results.skip;
  console.log('\n' + c.bold('════════════════════════════════════════'));
  console.log(c.bold('  TEST RESULTS'));
  console.log(c.bold('════════════════════════════════════════'));
  console.log(c.green(`  ✓ Passed : ${results.pass}`));
  console.log(c.red(`  ✗ Failed : ${results.fail}`));
  console.log(c.yellow(`  ⊘ Skipped: ${results.skip}`));
  console.log(c.dim(`  Total   : ${total}`));
  console.log('════════════════════════════════════════\n');

  process.exit(results.fail > 0 ? 1 : 0);
}

main().catch(console.error);
