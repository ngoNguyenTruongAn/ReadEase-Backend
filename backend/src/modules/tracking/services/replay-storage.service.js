const { Injectable } = require('@nestjs/common');
const { InjectRepository, InjectDataSource } = require('@nestjs/typeorm');

const { SessionReplayEventEntity } = require('../entities/session-replay-event.entity');
const { logger } = require('../../../common/logger/winston.config');

class ReplayStorageService {
  constructor(repository, dataSource) {
    this.repository = repository;
    this.dataSource = dataSource;
  }

  /**
   * Ensure reading session exists before inserting replay events
   */
  async ensureSessionExists(sessionId, userId) {
    const result = await this.dataSource.query(`SELECT id FROM reading_sessions WHERE id=$1`, [
      sessionId,
    ]);

    if (result.length === 0 && userId) {
      await this.dataSource.query(
        `
        INSERT INTO reading_sessions
        (id, user_id, content_id, status)
        VALUES ($1,$2,$3,'ACTIVE')
        ON CONFLICT (id) DO NOTHING
        `,
        [sessionId, userId, '11111111-1111-1111-1111-111111111111'],
      );
    }
  }

  /**
   * Store replay events in batch
   */
  async storeEvents(sessionId, events) {
    if (!Array.isArray(events) || events.length === 0) {
      return;
    }

    const BATCH_SIZE = 500;

    try {
      /**
       * FIX: extract userId from first event
       * because Redis events contain userId
       */
      const userId = events[0]?.userId;

      if (!userId) {
        logger.warn('Missing userId in replay events', {
          context: 'ReplayStorageService',
          data: { sessionId },
        });

        return;
      }

      // ensure session exists
      await this.ensureSessionExists(sessionId, userId);

      for (let i = 0; i < events.length; i += BATCH_SIZE) {
        const chunk = events.slice(i, i + BATCH_SIZE);

        const rows = chunk.map((e) => ({
          session_id: sessionId,
          event_type: e.type || 'mouse_move',
          payload: e,
          cognitive_state: e.state || e.cognitiveState || null,
          intervention_type: e.interventionType || null,
          timestamp: Number(e.timestamp),
          created_at: new Date(),
        }));

        await this.repository.insert(rows);
      }
    } catch (err) {
      logger.error('DB insert failed', {
        context: 'ReplayStorageService',
        data: {
          sessionId,
          error: err.message,
        },
      });
    }
  }
}

Injectable()(ReplayStorageService);

InjectRepository(SessionReplayEventEntity)(ReplayStorageService, undefined, 0);

InjectDataSource()(ReplayStorageService, undefined, 1);

module.exports = ReplayStorageService;
