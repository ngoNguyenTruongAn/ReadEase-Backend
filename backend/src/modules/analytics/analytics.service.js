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

  // ─── [S2-T04] Session Replay ───────────────────────────────────────

  /**
   * Get ordered replay events for a specific session.
   *
   * Returns all session_replay_events sorted by timestamp ASC,
   * including cognitive_state and intervention_type metadata.
   * Also provides a session-level summary.
   *
   * @param {string} sessionId - UUID of the reading session
   * @returns {object} Replay data with events + session summary
   */
  async getSessionReplay(sessionId) {
    // 1. Fetch session metadata
    const sessions = await this.dataSource.query(
      `SELECT rs.id, rs.user_id, rs.content_id, rs.status,
              rs.started_at, rs.ended_at, rs.effort_score,
              rs.cognitive_state_summary,
              rc.title AS content_title
       FROM reading_sessions rs
       LEFT JOIN reading_content rc ON rc.id = rs.content_id
       WHERE rs.id = $1`,
      [sessionId],
    );

    if (!sessions || sessions.length === 0) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const session = sessions[0];

    // 2. Fetch replay events ordered by timestamp
    const events = await this.dataSource.query(
      `SELECT id, event_type, payload, cognitive_state,
              intervention_type, timestamp, created_at
       FROM session_replay_events
       WHERE session_id = $1
       ORDER BY timestamp ASC`,
      [sessionId],
    );

    // 3. Compute event summary
    const totalEvents = events.length;
    const cognitiveStateCounts = {};
    const interventionCounts = {};

    for (const event of events) {
      if (event.cognitive_state) {
        cognitiveStateCounts[event.cognitive_state] =
          (cognitiveStateCounts[event.cognitive_state] || 0) + 1;
      }
      if (event.intervention_type) {
        interventionCounts[event.intervention_type] =
          (interventionCounts[event.intervention_type] || 0) + 1;
      }
    }

    const durationMs =
      session.started_at && session.ended_at
        ? new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()
        : null;

    logger.info('Session replay retrieved', {
      context: 'AnalyticsService',
      data: { sessionId, totalEvents },
    });

    return {
      session: {
        id: session.id,
        child_id: session.user_id,
        content_id: session.content_id,
        content_title: session.content_title,
        status: session.status,
        started_at: session.started_at,
        ended_at: session.ended_at,
        effort_score: Number(session.effort_score) || 0,
        cognitive_state_summary: session.cognitive_state_summary || {},
        duration_ms: durationMs,
      },
      events,
      summary: {
        total_events: totalEvents,
        cognitive_state_counts: cognitiveStateCounts,
        intervention_counts: interventionCounts,
      },
    };
  }

  // ─── [S2-T04] Child Session List ───────────────────────────────────

  /**
   * Get paginated session list for a child.
   *
   * Returns sessions with summary fields, ordered by most recent first.
   *
   * @param {string} childId - UUID of the child
   * @param {number} limit - Max results (1-100)
   * @param {number} offset - Pagination offset
   * @param {string|undefined} status - Optional status filter
   * @returns {object} Paginated session list with metadata
   */
  async getChildSessions(childId, limit, offset, status) {
    // Build WHERE clause dynamically
    const conditions = ['rs.user_id = $1'];
    const params = [childId];

    if (status) {
      conditions.push(`rs.status = $${params.length + 1}`);
      params.push(status);
    }

    const whereClause = conditions.join(' AND ');

    // Count total
    const countRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total
       FROM reading_sessions rs
       WHERE ${whereClause}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);

    // Fetch paginated data
    const dataParams = [...params, limit, offset];
    const dataRows = await this.dataSource.query(
      `SELECT rs.id, rs.user_id, rs.content_id, rs.status,
              rs.started_at, rs.ended_at, rs.effort_score,
              rs.cognitive_state_summary,
              rc.title AS content_title
       FROM reading_sessions rs
       LEFT JOIN reading_content rc ON rc.id = rs.content_id
       WHERE ${whereClause}
       ORDER BY rs.started_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams,
    );

    const sessions = dataRows.map((row) => ({
      id: row.id,
      child_id: row.user_id,
      content_id: row.content_id,
      content_title: row.content_title,
      status: row.status,
      started_at: row.started_at,
      ended_at: row.ended_at,
      effort_score: Number(row.effort_score) || 0,
      cognitive_state_summary: row.cognitive_state_summary || {},
    }));

    logger.info('Child sessions retrieved', {
      context: 'AnalyticsService',
      data: { childId, total, returned: sessions.length },
    });

    return {
      data: sessions,
      meta: { limit, offset, total },
    };
  }

  // ─── [S2-T04] Trend Analytics ──────────────────────────────────────

  /**
   * Get daily trend data for a child over a configurable window.
   *
   * Returns per-day aggregation of:
   * - cognitive_state distribution (FLUENT/REGRESSION/DISTRACTION counts)
   * - average effort_score
   * - session count
   *
   * @param {string} childId - UUID of the child
   * @param {number} days - Look-back window in days (1-90)
   * @returns {object} Daily trend data
   */
  async getTrends(childId, days) {
    // 1. Aggregate sessions per day within the window
    const dailyRows = await this.dataSource.query(
      `SELECT
         DATE(rs.started_at) AS date,
         COUNT(*)::int AS session_count,
         ROUND(AVG(rs.effort_score)::numeric, 4) AS avg_effort_score
       FROM reading_sessions rs
       WHERE rs.user_id = $1
         AND rs.started_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(rs.started_at)
       ORDER BY DATE(rs.started_at) ASC`,
      [childId, days],
    );

    // 2. Aggregate cognitive states across session_replay_events per day
    const stateRows = await this.dataSource.query(
      `SELECT
         DATE(rs.started_at) AS date,
         sre.cognitive_state,
         COUNT(*)::int AS count
       FROM session_replay_events sre
       JOIN reading_sessions rs ON rs.id = sre.session_id
       WHERE rs.user_id = $1
         AND rs.started_at >= NOW() - INTERVAL '1 day' * $2
         AND sre.cognitive_state IS NOT NULL
       GROUP BY DATE(rs.started_at), sre.cognitive_state
       ORDER BY DATE(rs.started_at) ASC`,
      [childId, days],
    );

    // 3. Build state distribution lookup: { '2026-03-28': { FLUENT: 12, REGRESSION: 3, ... } }
    const stateByDate = {};
    for (const row of stateRows) {
      const dateKey =
        row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date);
      if (!stateByDate[dateKey]) {
        stateByDate[dateKey] = {};
      }
      stateByDate[dateKey][row.cognitive_state] = row.count;
    }

    // 4. Combine into daily trend entries
    const daily = dailyRows.map((row) => {
      const dateKey =
        row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date);
      return {
        date: dateKey,
        session_count: row.session_count,
        avg_effort_score: Number(row.avg_effort_score) || 0,
        cognitive_state_distribution: stateByDate[dateKey] || {},
      };
    });

    // 5. Compute period summary
    const totalSessions = daily.reduce((sum, d) => sum + d.session_count, 0);
    const avgEffort =
      totalSessions > 0
        ? +(
            daily.reduce((sum, d) => sum + d.avg_effort_score * d.session_count, 0) / totalSessions
          ).toFixed(4)
        : 0;

    logger.info('Trends generated', {
      context: 'AnalyticsService',
      data: { childId, days, totalSessions, daysWithData: daily.length },
    });

    return {
      child_id: childId,
      window_days: days,
      daily,
      summary: {
        total_sessions: totalSessions,
        days_with_sessions: daily.length,
        avg_effort_score: avgEffort,
      },
    };
  }
}

Injectable()(AnalyticsService);
InjectDataSource()(AnalyticsService, undefined, 0);

module.exports = { AnalyticsService };
