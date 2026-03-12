const {TrackingGateway} = require("./tracking.gateway");
const TrajectoryBufferService = require("./services/trajectory-buffer.service");
const ReplayStorageService = require("./services/replay-storage.service");

class TrackingModule {
  constructor() {
    const replayStorage = new ReplayStorageService();
    const buffer = new TrajectoryBufferService(replayStorage);

    this.gateway = new TrackingGateway(buffer, replayStorage);
  }
}

module.exports = { TrackingModule };