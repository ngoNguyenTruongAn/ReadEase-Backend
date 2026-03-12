const { Pool } = require("pg");

class ReplayStorageService {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || "127.0.0.1",
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || "readease_app",
      password: process.env.DB_PASSWORD || "devpassword",
      database: process.env.DB_NAME || "readease",
    });
  }

  async storeEvents(sessionId, events) {
    if (!events.length) return;

    const values = [];
    const params = [];
    let i = 1;

    for (const e of events) {
      // Thêm 5 tham số thay vì 4
      values.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
      
      params.push(
        sessionId,
        e.type || "mouse_move",      // Map vào cột event_type
        JSON.stringify(e),           // Map vào cột payload
        e.timestamp || Date.now(),           // Map vào cột timestamp (lấy 't' từ event payload)
        new Date()                   // Map vào cột created_at
      );
    }

    // Sửa lại tên cột cho khớp với Entity
    const query = `
      INSERT INTO session_replay_events
      (session_id, event_type, payload, timestamp, created_at)
      VALUES ${values.join(",")}
    `;

    await this.pool.query(query, params);
  }

  async storeCalibration(sessionId, data) {
    await this.pool.query(
      `
      INSERT INTO session_replay_events
      (session_id, event_type, payload, timestamp, created_at)
      VALUES ($1,$2,$3,$4,$5)
      `,
      [
        sessionId,
        "calibration",
        JSON.stringify(data),
        Date.now(),
        new Date(),
      ]
    );
  }
}

module.exports = ReplayStorageService;