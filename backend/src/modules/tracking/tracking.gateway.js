const WebSocket = require("ws");
const { randomUUID } = require("crypto");
// Import hàm verify JWT từ file của bạn
const { verifyWebSocketJWT } = require("./utils/jwt-auth"); 

class TrackingGateway {
  constructor(trajectoryBuffer, replayStorage) {
    this.trajectoryBuffer = trajectoryBuffer;
    this.replayStorage = replayStorage;

    this.startServer();
  }

  startServer() {
    const port = process.env.WS_PORT || 3001;

    this.wss = new WebSocket.Server({
      port,
      path: "/tracking",
    });

    console.log(`Tracking WebSocket running on ws://localhost:${port}/tracking`);

    // req chứa thông tin của request HTTP upgrade ban đầu
    this.wss.on("connection", (ws, req) => {
      console.log("Client connected");
      console.log("WS CONNECTION PATH:", req.url);

      try {
        // 1. Lấy token từ query parameter của URL
        // Ví dụ URL: ws://localhost:3001/tracking?token=abc...
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get("token");

        if (!token) {
          throw new Error("Missing token in query parameters");
        }

        // 2. Xác thực JWT
        const decoded = verifyWebSocketJWT(token);

        // 3. Gắn thông tin user/session vào object `ws` để dùng cho các event sau
        ws.user_id = decoded.userId;
        ws.session_id = decoded.sessionId;
        
        console.log(`Authenticated connection for User: ${ws.userId}, Session: ${ws.sessionId}`);

      } catch (error) {
        console.error("WebSocket Authentication failed:", error.message);
        // Đóng kết nối ngay lập tức với mã lỗi 1008 (Policy Violation)
        ws.close(1008, "Unauthorized");
        return; 
      }

      // Xử lý message bình thường sau khi đã xác thực thành công
      ws.on("message", async (message) => {
        console.log("RAW WS MESSAGE:", message.toString());
        try {
          const data = JSON.parse(message.toString());

          switch (data.event) {
            case "session:start":
              // Ưu tiên dùng sessionId từ JWT nếu có, nếu không thì lấy từ payload / random
              ws.sessionId = ws.sessionId || data.payload.sessionId || randomUUID();
              console.log("Session started:", ws.sessionId);
              break;

            case "mouse:batch":
              if (!ws.sessionId) return;

              await this.trajectoryBuffer.push(
                ws.sessionId,
                data.payload.points
              );
              break;

            case "session:end":
              if (!ws.sessionId) return;

              await this.trajectoryBuffer.flushSession(ws.sessionId);
              console.log("Session ended:", ws.sessionId);
              break;
          }
        } catch (err) {
          console.error("WS message error:", err);
        }
      });

      ws.on("close", () => {
        console.log(`Client disconnected (Session: ${ws.sessionId})`);
      });
    });
  }
}

module.exports = { TrackingGateway };