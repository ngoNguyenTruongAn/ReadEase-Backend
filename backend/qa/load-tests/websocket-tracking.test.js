require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env")
});

const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");

/* CONFIG */

const CLIENTS = parseInt(process.env.LOAD_TEST_CLIENTS || "100", 10);
const POINTS_PER_BATCH = parseInt(process.env.LOAD_TEST_POINTS_PER_BATCH || "5", 10);
const INTERVAL = parseInt(process.env.LOAD_TEST_INTERVAL_MS || "100", 10);

const WS_URL = process.env.WS_URL || "ws://localhost:3000/tracking";
const JWT_SECRET = process.env.JWT_SECRET;

const TEST_CONTENT_ID =
  process.env.TEST_CONTENT_ID ||
  "46620bb6-8e60-47c2-a9be-ff801120985c";

if (!JWT_SECRET) {
  console.error("JWT_SECRET missing in .env");
  process.exit(1);
}

/* METRICS */

const latencies = [];
let totalEvents = 0;
let connectedClients = 0;
let disconnectedClients = 0;

/* TOKEN */

function createToken(sessionId, userId) {

  return jwt.sign(
    {
      user_id: userId,
      session_id: sessionId
    },
    JWT_SECRET
  );

}

console.log(`Starting load test with ${CLIENTS} clients...`);

function startClient(i) {

  const sessionId = randomUUID();
  const userId = "7915db3e-4394-4232-9353-620325ad43e4";

  const token = createToken(sessionId, userId);

  const ws = new WebSocket(`${WS_URL}?token=${token}`);

  let interval;

  ws.on("open", () => {

    connectedClients++;

    console.log(`Client ${i} connected`);

    ws.send(JSON.stringify({
      event: "session:start",
      data: {
        sessionId,
        contentId: TEST_CONTENT_ID,
        timestamp: Date.now()
      }
    }));

    interval = setInterval(() => {

      const points = [];

      for (let j = 0; j < POINTS_PER_BATCH; j++) {

        points.push({
          x: Math.random() * 1000,
          y: Math.random() * 1000,
          timestamp: Date.now()
        });

      }

      const start = process.hrtime.bigint();

      ws.send(JSON.stringify({
        event: "mouse:batch",
        data: {
          sessionId,
          points
        }
      }));

      const end = process.hrtime.bigint();

      latencies.push(Number(end - start) / 1e6);

      totalEvents++;

    }, INTERVAL);

  });

  setTimeout(() => {

    if (ws.readyState === WebSocket.OPEN) {

      ws.send(JSON.stringify({
        event: "session:end",
        data: { sessionId }
      }));

      if (interval) clearInterval(interval);

      ws.close();

    }

  }, 10000);

  ws.on("error", (err) => {
    console.error(`Client ${i} error:`, err.message);
  });

  ws.on("close", () => {
    disconnectedClients++;
  });

}

/* RAMP */

let started = 0;

const ramp = setInterval(() => {

  startClient(started);

  started++;

  if (started >= CLIENTS) {
    clearInterval(ramp);
  }

}, 50);

/* RESULTS */

setTimeout(() => {

  console.log("\n==============================");
  console.log("LOAD TEST RESULTS");
  console.log("==============================");

  if (latencies.length === 0) {
    console.log("No latency samples collected");
    process.exit(0);
  }

  latencies.sort((a, b) => a - b);

  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  const avg =
    latencies.reduce((a, b) => a + b, 0) / latencies.length;

  const duration = 10;

  const tps = totalEvents / duration;

  console.log(`Clients: ${CLIENTS}`);
  console.log(`Connected: ${connectedClients}`);
  console.log(`Disconnected: ${disconnectedClients}`);

  console.log("\nLatency:");

  console.log(`AVG: ${avg.toFixed(2)} ms`);
  console.log(`P50: ${p50} ms`);
  console.log(`P95: ${p95} ms`);
  console.log(`P99: ${p99} ms`);

  console.log("\nThroughput:");

  console.log(`Total events: ${totalEvents}`);
  console.log(`TPS: ${tps.toFixed(2)} events/sec`);

  console.log("==============================");

  process.exit(0);

}, 12000);