require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env")
});

const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");
const CLIENTS = 1000;
const WS_URL = process.env.WS_URL || "ws://localhost:3001/tracking";
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("JWT_SECRET missing in .env");
  process.exit(1);
}

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

for (let i = 0; i < CLIENTS; i++) {

  const sessionId = randomUUID();
const userId = randomUUID();
const token = createToken(sessionId, userId);

  const ws = new WebSocket(`${WS_URL}?token=${token}`);

  ws.on("open", () => {

    console.log(`Client ${i} connected`);

    /* start session */

    ws.send(
      JSON.stringify({
        event: "session:start",
        payload: {
          sessionId: sessionId,
          timestamp: Date.now()
        }
      })
    );

    /* send mouse batches */

    setInterval(() => {

      const points = [];

      for (let j = 0; j < 5; j++) {
        points.push({
          x: Math.random() * 1000,
          y: Math.random() * 1000,
          timestamp: Date.now(),
        });
      }

      ws.send(
        JSON.stringify({
          event: "mouse:batch",
          payload: {
            sessionId: sessionId,
            points: points
          }
        })
      );

    }, 100);

  });

  ws.on("error", (err) => {
    console.error(`Client ${i} error:`, err.message);
  });

  ws.on("close", () => {
    console.log(`Client ${i} disconnected`);
  });
}