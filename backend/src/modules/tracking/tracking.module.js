const { Module } = require("@nestjs/common");
const { TypeOrmModule } = require("@nestjs/typeorm");

const TrackingGateway = require("./tracking.gateway");

const TrajectoryBufferService = require("./services/trajectory-buffer.service");
const ReplayStorageService = require("./services/replay-storage.service");
const SessionService = require("./services/session.service");

const { SessionReplayEventEntity } = require("./entities/session-replay-event.entity");

class TrackingModule {}

Module({
  imports: [
    TypeOrmModule.forFeature([
      SessionReplayEventEntity
    ])
  ],
  providers: [
    TrackingGateway,
    TrajectoryBufferService,
    ReplayStorageService,
    SessionService
  ]
})(TrackingModule);

module.exports = { TrackingModule };