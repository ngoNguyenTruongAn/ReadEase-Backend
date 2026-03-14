const {
  WebSocketGateway,
  SubscribeMessage
} = require("@nestjs/websockets");

const { Injectable, Inject } = require("@nestjs/common");

const { logger } = require("../../common/logger/winston.config");

const {
  ws_connection_count,
  trajectory_events_received,
  ws_processing_latency
} = require("../../common/observability/metrics");

const { verifyWebSocketJWT } = require("./utils/jwt-auth");

const TrajectoryBufferService = require("./services/trajectory-buffer.service");
const SessionService = require("./services/session.service");
const ReplayStorageService = require("./services/replay-storage.service");

class TrackingGateway {

  constructor(trajectoryBufferService, sessionService, replayStorageService) {
    this.trajectoryBuffer = trajectoryBufferService;
    this.sessionService = sessionService;
    this.replayStorage = replayStorageService;
  }

  handleConnection(client, request) {

    try {

      const url = new URL(request.url, "http://localhost");
      const token = url.searchParams.get("token");

      const decoded = verifyWebSocketJWT(token);

      client.user_id = decoded.user_id;
      client.session_id = decoded.session_id;

      ws_connection_count.inc();

      logger.info("WS client connected", {
        context: "TrackingGateway",
        data: decoded
      });

    } catch (err) {

      logger.warn("WS auth failed", {
        context: "TrackingGateway",
        data: { error: err.message }
      });

      client.close();

    }

  }

  /* =========================
     SESSION START
  ========================= */

  async handleSessionStart(client, payload) {

    try {

      if (!client.session_id) return;

      const contentId =
        payload?.contentId ||
        payload?.content_id ||
        "11111111-1111-1111-1111-111111111111";

      await this.sessionService.ensureSession(
        client.session_id,
        client.user_id,
        contentId
      );

      logger.info("Session started", {
        context: "TrackingGateway",
        data: {
          sessionId: client.session_id,
          contentId
        }
      });

    } catch (err) {

      logger.error("session:start failed", {
        context: "TrackingGateway",
        data: { error: err.message }
      });

    }

  }

  /* =========================
     MOUSE BATCH
  ========================= */

  async handleMouseBatch(client, payload) {

    const end = ws_processing_latency.startTimer();

    try {

      if (!client.session_id) return;

      const points = payload?.data?.points || payload?.points || [];

      trajectory_events_received.inc(points.length);

      await this.trajectoryBuffer.push(
        client.session_id,
        client.user_id,
        points
      );

    } catch (err) {

      logger.error("mouse batch failed", {
        context: "TrackingGateway",
        data: { error: err.message }
      });

    }

    end();

  }

  /* =========================
     SESSION END
  ========================= */

  async handleSessionEnd(client) {

    try {

      if (!client.session_id) return;

      await this.trajectoryBuffer.flushSession(
        client.session_id
      );

      await this.sessionService.endSession(
        client.session_id
      );

    } catch (err) {

      logger.error("session end failed", {
        context: "TrackingGateway",
        data: { error: err.message }
      });

    }

  }

  /* =========================
     CALIBRATION DATA
     30s mini-game calibration
  ========================= */

  async handleCalibrationData(client, payload) {

    try {

      if (!client.session_id) return;

      const calibrationData = {
        childId: payload?.childId || payload?.child_id || client.user_id,
        events: payload?.events || [],
        duration: payload?.duration || 30000,
        gameType: payload?.gameType || "target_tracking"
      };

      // Store as session_replay_event
      await this.replayStorage.storeEvents(client.session_id, [{
        type: "calibration",
        userId: client.user_id,
        timestamp: Date.now(),
        ...calibrationData
      }]);

      logger.info("Calibration data received", {
        context: "TrackingGateway",
        data: {
          sessionId: client.session_id,
          eventsCount: calibrationData.events.length,
          duration: calibrationData.duration
        }
      });

      // Send acknowledgement back to client
      if (client.readyState === 1) {
        client.send(JSON.stringify({
          event: "calibration:ack",
          data: { status: "received", sessionId: client.session_id }
        }));
      }

    } catch (err) {

      logger.error("calibration:data failed", {
        context: "TrackingGateway",
        data: { error: err.message }
      });

    }

  }

  /* =========================
     TOOLTIP SHOW
     Semantic intervention signal
  ========================= */

  async handleTooltipShow(client, payload) {

    try {

      if (!client.session_id) return;

      const tooltipEvent = {
        type: "TOOLTIP_SHOWN",
        userId: client.user_id,
        timestamp: payload?.timestamp || Date.now(),
        wordIndex: payload?.wordIndex,
        original: payload?.original,
        simplified: payload?.simplified,
        interventionType: "SEMANTIC",
        cognitiveState: payload?.cognitiveState || null
      };

      // Store as session_replay_event for clinician replay
      await this.replayStorage.storeEvents(client.session_id, [tooltipEvent]);

      logger.info("Tooltip shown", {
        context: "TrackingGateway",
        data: {
          sessionId: client.session_id,
          wordIndex: tooltipEvent.wordIndex,
          original: tooltipEvent.original,
          simplified: tooltipEvent.simplified
        }
      });

    } catch (err) {

      logger.error("tooltip:show failed", {
        context: "TrackingGateway",
        data: { error: err.message }
      });

    }

  }

}

Injectable()(TrackingGateway);

Inject(TrajectoryBufferService)(TrackingGateway, undefined, 0);
Inject(SessionService)(TrackingGateway, undefined, 1);
Inject(ReplayStorageService)(TrackingGateway, undefined, 2);

Reflect.decorate(
  [WebSocketGateway({ path: "/tracking", cors: true })],
  TrackingGateway
);

Reflect.decorate(
  [SubscribeMessage("session:start")],
  TrackingGateway.prototype,
  "handleSessionStart",
  Object.getOwnPropertyDescriptor(
    TrackingGateway.prototype,
    "handleSessionStart"
  )
);

Reflect.decorate(
  [SubscribeMessage("mouse:batch")],
  TrackingGateway.prototype,
  "handleMouseBatch",
  Object.getOwnPropertyDescriptor(
    TrackingGateway.prototype,
    "handleMouseBatch"
  )
);

Reflect.decorate(
  [SubscribeMessage("session:end")],
  TrackingGateway.prototype,
  "handleSessionEnd",
  Object.getOwnPropertyDescriptor(
    TrackingGateway.prototype,
    "handleSessionEnd"
  )
);

Reflect.decorate(
  [SubscribeMessage("calibration:data")],
  TrackingGateway.prototype,
  "handleCalibrationData",
  Object.getOwnPropertyDescriptor(
    TrackingGateway.prototype,
    "handleCalibrationData"
  )
);

Reflect.decorate(
  [SubscribeMessage("tooltip:show")],
  TrackingGateway.prototype,
  "handleTooltipShow",
  Object.getOwnPropertyDescriptor(
    TrackingGateway.prototype,
    "handleTooltipShow"
  )
);

module.exports = TrackingGateway;