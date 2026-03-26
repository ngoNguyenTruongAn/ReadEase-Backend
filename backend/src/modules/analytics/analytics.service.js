const { Injectable, NotFoundException, ForbiddenException } = require('@nestjs/common');
const { InjectDataSource } = require('@nestjs/typeorm');
const { logger } = require('../../common/logger/winston.config');

class AnalyticsService {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  /**
   * Get spatiotemporal heatmap data for a reading session.
   *
   * Aggregates mouse-tracking events per word_index to compute
   * a difficulty score based on regression count (60%) and dwell time (40%).
   *
   * @param {string} childId - UUID of the child
   * @param {string} sessionId - UUID of the reading session
   * @returns {object} Heatmap response with per-word difficulty scores
   */
  async getHeatmap(childId, sessionId) {
    // 1. Fetch session + content, verify ownership
    const sessions = await this.dataSource.query(
      `SELECT rs.id, rs.user_id, rs.content_id, rs.created_at,
              rc.body, rc.title
       FROM reading_sessions rs
       JOIN reading_content rc ON rc.id = rs.content_id
       WHERE rs.id = $1`,
      [sessionId],
    );

    if (!sessions || sessions.length === 0) {
      throw new NotFoundException('Reading session not found');
    }

    const session = sessions[0];

    if (session.user_id !== childId) {
      throw new ForbiddenException('Session does not belong to this child');
    }

    // 2. Aggregate mouse events per word_index
    const wordStats = await this.dataSource.query(
      `SELECT
         (payload->>'wordIndex')::int AS word_index,
         COUNT(*) FILTER (
           WHERE payload->>'isRegression' = 'true'
         ) AS regression_count,
         SUM(
           CASE
             WHEN (payload->>'dwellMs')::numeric > 0
             THEN (payload->>'dwellMs')::numeric
             ELSE 0
           END
         ) AS total_dwell_ms,
         COUNT(*) AS event_count
       FROM session_replay_events
       WHERE session_id = $1
         AND event_type = 'mouse_move'
         AND payload->>'wordIndex' IS NOT NULL
       GROUP BY (payload->>'wordIndex')::int
       ORDER BY (payload->>'wordIndex')::int`,
      [sessionId],
    );

    // 3. Split content body into words
    const body = session.body || '';
    const wordList = body.split(/\s+/).filter((w) => w.length > 0);

    // 4. Compute difficulty scores
    //    Formula: difficulty = 0.6 * norm(regression) + 0.4 * norm(dwell)
    //    Based on Eye Tracking ML paper (2015): regression count is
    //    the strongest predictor of reading difficulty.
    const maxReg = Math.max(...wordStats.map((w) => Number(w.regression_count) || 0), 1);
    const maxDwell = Math.max(...wordStats.map((w) => Number(w.total_dwell_ms) || 0), 1);

    const words = wordList.map((text, index) => {
      const stat = wordStats.find((w) => Number(w.word_index) === index);
      const regressions = Number(stat?.regression_count) || 0;
      const dwellMs = Number(stat?.total_dwell_ms) || 0;

      const regNorm = regressions / maxReg;
      const dwellNorm = dwellMs / maxDwell;
      const difficulty = +(0.6 * regNorm + 0.4 * dwellNorm).toFixed(2);

      return {
        index,
        text,
        difficulty,
        regressions,
        dwell_ms: Math.round(dwellMs),
      };
    });

    // 5. Build summary
    const totalRegressions = words.reduce((sum, w) => sum + w.regressions, 0);
    const avgDifficulty = words.length
      ? +(words.reduce((sum, w) => sum + w.difficulty, 0) / words.length).toFixed(2)
      : 0;
    const totalDwellMs = words.reduce((sum, w) => sum + w.dwell_ms, 0);

    const hardestWords = [...words]
      .sort((a, b) => b.difficulty - a.difficulty)
      .filter((w) => w.difficulty > 0)
      .slice(0, 5)
      .map((w) => w.text);

    const result = {
      child_id: childId,
      session_id: sessionId,
      content_id: session.content_id,
      content_title: session.title,
      session_date: session.created_at,
      total_words: wordList.length,
      words,
      summary: {
        hardest_words: hardestWords,
        avg_difficulty: avgDifficulty,
        total_regressions: totalRegressions,
        total_reading_time_ms: totalDwellMs,
      },
    };

    logger.info('Heatmap generated', {
      context: 'AnalyticsService',
      data: {
        childId,
        sessionId,
        totalWords: wordList.length,
        avgDifficulty,
        totalRegressions,
      },
    });

    return result;
  }
}

Injectable()(AnalyticsService);
InjectDataSource()(AnalyticsService, undefined, 0);

module.exports = { AnalyticsService };
