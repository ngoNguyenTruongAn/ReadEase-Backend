const { Module } = require('@nestjs/common');
const { TypeOrmModule } = require('@nestjs/typeorm');
const { HttpModule } = require('@nestjs/axios');

const TrackingGateway = require('./tracking.gateway');

const TrajectoryBufferService = require('./services/trajectory-buffer.service');
const ReplayStorageService = require('./services/replay-storage.service');
const SessionService = require('./services/session.service');
const MlClientService = require('./services/ml-client.service');

const { SessionReplayEventEntity } = require('./entities/session-replay-event.entity');

class TrackingModule {}

Module({
  imports: [TypeOrmModule.forFeature([SessionReplayEventEntity]), HttpModule],
  providers: [
    TrackingGateway,
    TrajectoryBufferService,
    ReplayStorageService,
    SessionService,
    MlClientService,
  ],
})(TrackingModule);

module.exports = { TrackingModule };
