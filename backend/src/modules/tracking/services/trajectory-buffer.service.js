class TrajectoryBufferService {
  constructor(replayStorage) {
    this.replayStorage = replayStorage;
    this.buffers = new Map();

    setInterval(() => {
      this.flushAll();
    }, 2000);
  }

  addEvent(sessionId, event) {
    if (!this.buffers.has(sessionId)) {
      this.buffers.set(sessionId, []);
    }
    this.buffers.get(sessionId).push(event);
  }

  // Gateway đang gọi hàm này để thêm nhiều điểm chuột cùng lúc
  async push(sessionId, points) {
    for (const p of points) {
      this.addEvent(sessionId, { type: "mouse_move", ...p });
    }
    console.log("BUFFER PUSH:", sessionId, points.length);
  }

  // Gateway gọi hàm này khi end session
  async flushSession(sessionId) {
    const events = this.buffers.get(sessionId);
    if (!events || events.length === 0) return;

    const eventsToStore = [...events];
    this.buffers.delete(sessionId);

    try {
      await this.replayStorage.storeEvents(sessionId, eventsToStore);
    } catch (err) {
      console.error(`[Buffer] Lỗi lưu trữ khi end session ${sessionId}:`, err.message);
    }
    console.log("FLUSH SESSION:", sessionId);
  }

  async flushAll() {
    for (const [sessionId, events] of this.buffers.entries()) {
      if (events.length === 0) continue;

      // 1. Copy events và clear buffer NGAY LẬP TỨC để tránh mất data mới tới (Race condition)
      const eventsToStore = [...events];
      this.buffers.set(sessionId, []);

      // 2. Bọc try/catch để interval không bị crash khi DB có vấn đề
      try {
        await this.replayStorage.storeEvents(sessionId, eventsToStore);
      } catch (error) {
        console.error(`[TrajectoryBuffer] Lỗi khi flush data của session ${sessionId}:`, error.message);
      }
    }
  }
}

module.exports = TrajectoryBufferService;