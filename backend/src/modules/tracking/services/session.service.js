const { Injectable } = require('@nestjs/common');
const { InjectDataSource } = require('@nestjs/typeorm');
const { logger } = require('../../../common/logger/winston.config');

class SessionService {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  clampEffortScore(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 0;
    if (numericValue < 0) return 0;
    if (numericValue > 1) return 1;
    return Number(numericValue.toFixed(4));
  }

  buildCognitiveStateSummary(rows) {
    const counts = {
      FLUENT: 0,
      REGRESSION: 0,
      DISTRACTION: 0,
    };

    let totalConfidence = 0;
    let confidenceSamples = 0;

    for (const row of rows) {
      const state = row.state;
      if (counts[state] !== undefined) {
        counts[state] += 1;
      }

      const confidence = Number(row.confidence);
      if (Number.isFinite(confidence)) {
        totalConfidence += confidence;
        confidenceSamples += 1;
      }
    }

    const totalEvents = counts.FLUENT + counts.REGRESSION + counts.DISTRACTION;

    let effortScore = 0;
    if (totalEvents > 0) {
      const weightedSum = counts.FLUENT * 1 + counts.REGRESSION * 0.75 + counts.DISTRACTION * 0.2;
      effortScore = this.clampEffortScore(weightedSum / totalEvents);
    }

    return {
      total_events: totalEvents,
      state_counts: counts,
      confidence_avg:
        confidenceSamples > 0 ? Number((totalConfidence / confidenceSamples).toFixed(4)) : null,
      effort_score: effortScore,
      computed_at: new Date().toISOString(),
    };
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
        [sessionId, userId, contentId],
      );
    } catch (err) {
      logger.error('ensureSession failed', {
        context: 'SessionService',
        data: { sessionId, error: err.message },
      });
    }
  }

  async endSession(sessionId) {
    try {
      const events = await this.dataSource.query(
        `
        SELECT
          COALESCE(payload->>'state', cognitive_state) AS state,
          payload->>'confidence' AS confidence
        FROM session_replay_events
        WHERE session_id = $1
          AND event_type = 'COGNITIVE_STATE'
        `,
        [sessionId],
      );

      const cognitiveSummary = this.buildCognitiveStateSummary(events);

      await this.dataSource.query(
        `
        UPDATE reading_sessions
        SET status='COMPLETED',
            ended_at=NOW(),
            cognitive_state_summary=$2::jsonb,
            effort_score=$3
        WHERE id=$1
        `,
        [sessionId, JSON.stringify(cognitiveSummary), cognitiveSummary.effort_score],
      );

      return cognitiveSummary;
    } catch (err) {
      logger.error('endSession failed', {
        context: 'SessionService',
        data: { sessionId, error: err.message },
      });

      throw err;
    }
  }
}

Injectable()(SessionService);
InjectDataSource()(SessionService, undefined, 0);

module.exports = SessionService;
