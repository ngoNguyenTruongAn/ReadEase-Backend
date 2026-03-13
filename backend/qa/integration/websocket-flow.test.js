require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env")
});

const WebSocket = require("ws");
const { Client } = require("pg");
const Redis = require("ioredis");
const { randomUUID } = require("crypto");
const jwt = require("jsonwebtoken");

/* ──────────────────────────────────────────────
   CONFIG
────────────────────────────────────────────── */

const SESSION_ID = randomUUID();
const USER_ID = randomUUID();
const CONTENT_ID = randomUUID();

const WS_URL = process.env.WS_URL || "ws://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const token = jwt.sign(
{
  user_id: USER_ID,
  session_id: SESSION_ID
},
process.env.JWT_SECRET
);

const pg = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT
});

const TEST_TIMEOUT = 20000;

/* ──────────────────────────────────────────────
   UTILITIES
────────────────────────────────────────────── */

const log = (...msg) => console.log("[integration-test]", ...msg);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReplayEvents(sessionId, timeout = 15000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const res = await pg.query(
      "SELECT COUNT(*) FROM session_replay_events WHERE session_id=$1",
      [sessionId]
    );

    const count = parseInt(res.rows[0].count);

    if (count > 0) {
      return count;
    }

    await sleep(500);
  }

  throw new Error("Timeout waiting for replay events");
}

async function cleanup(sessionId, userId, contentId) {
  log("Cleaning up test data...");

  await pg.query(
    "DELETE FROM session_replay_events WHERE session_id=$1",
    [sessionId]
  );

  await pg.query(
    "DELETE FROM reading_sessions WHERE id=$1",
    [sessionId]
  );

  await pg.query(
    "DELETE FROM reading_content WHERE id=$1",
    [contentId]
  );

  await pg.query(
    "DELETE FROM users WHERE id=$1",
    [userId]
  );
}

/* ──────────────────────────────────────────────
   MAIN TEST
────────────────────────────────────────────── */

async function run() {

  let ws;

  const timer = setTimeout(() => {
    console.error("TEST TIMEOUT");
    process.exit(1);
  }, TEST_TIMEOUT);

  try {

    /* Redis health check */

    log("Checking Redis...");
    const pong = await redis.ping();

    if (pong !== "PONG") {
      throw new Error("Redis not responding");
    }

    log("Redis OK");

    /* Postgres setup */

    log("Checking Postgres...");
    await pg.connect();
    await pg.query("SELECT 1");

    log("Creating test user...");

    await pg.query(
  `
  INSERT INTO users (
    id,
    email,
    password_hash,
    role,
    created_at,
    updated_at
  )
  VALUES ($1,$2,$3,$4,NOW(),NOW())
  `,
  [
    USER_ID,
    "integration@test.com",
    "hash",
    "ROLE_GUARDIAN"
  ]
);

    log("Creating test content...");

    await pg.query(
      `
      INSERT INTO reading_content (
        id,
        title,
        body,
        word_count
        
      )
      VALUES ($1,$2,$3,$4)
      `,
      [
        CONTENT_ID,
  "Integration Test Story",
  "This is a test content.",
  5
      ]
    );

    log("Creating test reading session...");

    await pg.query(
      `
      INSERT INTO reading_sessions (
        id,
        user_id,
        content_id,
        created_at
      )
      VALUES ($1,$2,$3,NOW())
      `,
      [
        SESSION_ID,
        USER_ID,
        CONTENT_ID
      ]
    );

    log("Postgres OK");

    /* WebSocket connect */

    log("Connecting WebSocket...");

    ws = new WebSocket(`${WS_URL}?token=${token}`);

    await new Promise((resolve, reject) => {

      const timeout = setTimeout(() => {
        reject(new Error("WebSocket connection timeout"));
      }, 5000);

      ws.on("open", () => {
        clearTimeout(timeout);
        resolve();
      });

      ws.on("error", reject);

      ws.on("close", () => {
        log("WebSocket closed");
      });

    });

    log("WebSocket connected");

    /* SESSION START */

    log("Sending session:start");

    ws.send(
      JSON.stringify({
        event: "session:start",
        data: {
          sessionId: SESSION_ID,
          timestamp: Date.now()
        }
      })
    );

    await sleep(500);

    /* SEND MOUSE EVENTS */

    log("Sending mouse batches");

    for (let i = 0; i < 10; i++) {

      const points = [];

      for (let j = 0; j < 5; j++) {
        points.push({
          x: Math.random() * 800,
          y: Math.random() * 600,
          timestamp: Date.now()
        });
      }

      ws.send(
        JSON.stringify({
          event: "mouse:batch",
          data: {
            sessionId: SESSION_ID,
            points
          }
        })
      );

      await sleep(100);
    }

    /* SESSION END */

    log("Sending session:end");

    ws.send(
      JSON.stringify({
        event: "session:end",
        data: {
          sessionId: SESSION_ID
        }
      })
    );

    await sleep(1000);

    /* VERIFY DATABASE */

    log("Waiting for DB persistence...");

    console.log("Checking DB for session:", SESSION_ID);

    const count = await waitForReplayEvents(SESSION_ID);

    log(`Replay events stored: ${count}`);

    log("Integration test completed successfully");

  } catch (err) {

    console.error("TEST FAILED:", err.message);
    process.exitCode = 1;

  } finally {

    clearTimeout(timer);

    if (ws) ws.close();

    await cleanup(SESSION_ID, USER_ID, CONTENT_ID);

    await redis.quit();
    await pg.end();
  }
}

run();