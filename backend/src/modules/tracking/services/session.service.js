const { Injectable } = require("@nestjs/common");
const { InjectDataSource } = require("@nestjs/typeorm");
const { logger } = require("../../../common/logger/winston.config");

class SessionService {

  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  async ensureSession(sessionId, userId, contentId) {

    try {

      await this.dataSource.query(
        `
        INSERT INTO reading_sessions
        (id, user_id, content_id, status)
        VALUES ($1,$2,$3,'ACTIVE')
        ON CONFLICT (id) DO NOTHING
        `,
        [
          sessionId,
          userId,
          contentId
        ]
      );

    } catch (err) {

      logger.error("ensureSession failed", {
        context: "SessionService",
        data: { sessionId, error: err.message }
      });

    }

  }

  async endSession(sessionId) {

    try {

      await this.dataSource.query(
        `
        UPDATE reading_sessions
        SET status='ENDED',
            ended_at=NOW()
        WHERE id=$1
        `,
        [sessionId]
      );

    } catch (err) {

      logger.error("endSession failed", {
        context: "SessionService",
        data: { sessionId, error: err.message }
      });

    }

  }

}

Injectable()(SessionService);
InjectDataSource()(SessionService, undefined, 0);

module.exports = SessionService;