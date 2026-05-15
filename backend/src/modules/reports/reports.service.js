/**
 * Reports Service
 *
 * Aggregates reading session data — including cognitive state classifications
 * and motor behaviour metrics — for a given child and week, calls GeminiService
 * to generate a Dyslexia-aware Markdown report, and persists the result.
 */

const {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} = require('@nestjs/common');
const { InjectRepository, InjectDataSource } = require('@nestjs/typeorm');
const { Between } = require('typeorm');

const { ReportEntity } = require('./entities/report.entity');
const { ReadingSessionEntity } = require('../reading/entities/reading-session.entity');
const { ReadingContentEntity } = require('../reading/entities/reading-content.entity');
const { UserEntity } = require('../users/entities/user.entity');
const { GeminiService } = require('./gemini.service');
const { logger } = require('../../common/logger/winston.config');

class ReportsService {
  constructor(
    reportRepository,
    sessionRepository,
    contentRepository,
    userRepository,
    geminiService,
    dataSource,
  ) {
    this.reportRepository = reportRepository;
    this.sessionRepository = sessionRepository;
    this.contentRepository = contentRepository;
    this.userRepository = userRepository;
    this.geminiService = geminiService;
    this.dataSource = dataSource;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GENERATE WEEKLY REPORT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Aggregate session data, call Gemini, and persist the report.
   *
   * @param {string} childId - UUID of the child user
   * @param {Date}   weekStart - Start of the reporting period
   * @param {Date}   weekEnd   - End of the reporting period
   * @returns {Promise<object>} The saved report entity
   */
  async generateWeeklyReport(childId, weekStart, weekEnd) {
    // ── 1. Validate child exists ──
    const child = await this.userRepository.findOne({
      where: { id: childId },
      select: ['id', 'display_name', 'email', 'role'],
    });

    if (!child) {
      throw new NotFoundException(`Child with ID ${childId} not found`);
    }

    // ── 2. Duplicate guard ──
    const existing = await this.reportRepository.findOne({
      where: {
        child_id: childId,
        period_start: weekStart,
        period_end: weekEnd,
      },
    });

    if (existing) {
      throw new ConflictException(
        `A report for this period (${weekStart.toISOString().slice(0, 10)} — ${weekEnd.toISOString().slice(0, 10)}) already exists`,
      );
    }

    // ── 3. Data aggregation (sessions + cognitive + motor) ──
    const aggregatedData = await this._aggregateSessionData(childId, child, weekStart, weekEnd);

    logger.info('Reading data aggregated for report', {
      context: 'ReportsService',
      data: {
        childId,
        totalSessions: aggregatedData.totalSessions,
        totalMinutes: aggregatedData.totalReadingMinutes,
        booksCount: aggregatedData.booksRead.length,
        cognitiveEvents:
          aggregatedData.cognitiveBreakdown.FLUENT +
          aggregatedData.cognitiveBreakdown.REGRESSION +
          aggregatedData.cognitiveBreakdown.DISTRACTION,
        motorEvents: aggregatedData.motorMetrics.totalEvents,
      },
    });

    // ── 4. Generate report via Gemini ──
    const aiResult = await this.geminiService.generateWeeklyReport(aggregatedData);

    // ── 5. Persist the report as DRAFT ──
    const report = this.reportRepository.create({
      child_id: childId,
      report_type: 'WEEKLY',
      content: aiResult.content,
      ai_model: aiResult.model,
      status: 'DRAFT',
      period_start: weekStart,
      period_end: weekEnd,
    });

    await this.reportRepository.save(report);

    logger.info('Weekly report saved as DRAFT', {
      context: 'ReportsService',
      data: {
        reportId: report.id,
        childId,
        status: 'DRAFT',
        model: aiResult.model,
        isFallback: aiResult.isFallback,
      },
    });

    return report;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // UPDATE REPORT CONTENT (CLINICIAN)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Clinician edits the generated Markdown content before approval.
   * Approved reports are immutable because they may already be visible to guardians.
   */
  async updateReportContent(reportId, content) {
    const report = await this.reportRepository.findOne({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException(`Report ${reportId} not found`);
    }

    if (report.status === 'APPROVED') {
      throw new ConflictException('Approved report content cannot be edited');
    }

    report.content = content;

    await this.reportRepository.save(report);

    logger.info('Report content updated by clinician', {
      context: 'ReportsService',
      data: { reportId, status: report.status },
    });

    return report;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // APPROVE REPORT (CLINICIAN)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Clinician approves a DRAFT report → status becomes APPROVED.
   * Only then will the guardian be able to see the report.
   */
  async approveReport(reportId, clinicianId) {
    const report = await this.reportRepository.findOne({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException(`Report ${reportId} not found`);
    }

    if (report.status === 'APPROVED') {
      throw new ConflictException('Report is already approved');
    }

    report.status = 'APPROVED';
    report.approved_by = clinicianId;
    report.approved_at = new Date();

    await this.reportRepository.save(report);

    logger.info('Report approved by clinician', {
      context: 'ReportsService',
      data: { reportId, clinicianId, status: 'APPROVED' },
    });

    return report;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // LIST REPORTS FOR A CHILD
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Retrieve reports for a child.
   * - Clinician: sees ALL (DRAFT + APPROVED)
   * - Guardian:  sees only APPROVED
   */
  async getReportsByChildId(childId, user) {
    const where = { child_id: childId };

    if (user.role === 'ROLE_GUARDIAN') {
      where.status = 'APPROVED';
    }

    return this.reportRepository.find({
      where,
      order: { period_start: 'DESC' },
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET SINGLE REPORT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Retrieve a single report.
   * Guardian can only access APPROVED reports.
   */
  async getReportById(reportId, user) {
    const report = await this.reportRepository.findOne({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException(`Report ${reportId} not found`);
    }

    if (user.role === 'ROLE_GUARDIAN' && report.status !== 'APPROVED') {
      throw new ForbiddenException('This report has not been approved yet');
    }

    return report;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PRIVATE: DATA AGGREGATION
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Query ReadingSession + ReadingContent + SessionReplayEvents + MouseEvents
   * to build comprehensive aggregated statistics for the Gemini prompt.
   */
  async _aggregateSessionData(childId, child, weekStart, weekEnd) {
    // Fetch all sessions for this child within the date range
    const sessions = await this.sessionRepository.find({
      where: {
        user_id: childId,
        started_at: Between(weekStart, weekEnd),
      },
      relations: ['content'],
      order: { started_at: 'ASC' },
    });

    let totalReadingMs = 0;
    let totalWords = 0;
    let effortSum = 0;
    let completedCount = 0;
    const booksMap = new Map(); // Deduplicate books by content_id
    const sessionIds = [];
    const sessionDetails = [];

    for (const session of sessions) {
      sessionIds.push(session.id);

      // Calculate reading duration
      let durationMs = 0;
      if (session.ended_at && session.started_at) {
        durationMs = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
        if (durationMs > 0) {
          totalReadingMs += durationMs;
        }
      }

      // Accumulate effort scores
      const effort = parseFloat(session.effort_score) || 0;
      effortSum += effort;

      // Count completed sessions
      if (session.status === 'COMPLETED' || session.ended_at) {
        completedCount++;
      }

      // Collect unique books read
      if (session.content && !booksMap.has(session.content_id)) {
        booksMap.set(session.content_id, {
          title: session.content.title || 'Untitled',
          difficulty: session.content.difficulty || 'N/A',
          wordCount: session.content.word_count || 0,
        });
        totalWords += session.content.word_count || 0;
      }

      const durationMinutes = Math.max(0, Math.round(durationMs / 60000));
      const wordCount = session.content?.word_count || 0;
      sessionDetails.push({
        id: session.id,
        date: session.started_at ? new Date(session.started_at).toISOString().slice(0, 10) : null,
        title: session.content?.title || 'Untitled',
        difficulty: session.content?.difficulty || 'N/A',
        status: session.status || 'UNKNOWN',
        durationMinutes,
        wordCount,
        wordsPerMinute: durationMinutes > 0 ? Math.round(wordCount / durationMinutes) : 0,
        effortScore: this._clampScore(effort),
      });
    }

    const totalReadingMinutes = Math.round(totalReadingMs / 60000);
    const averageEffortScore = sessions.length > 0 ? effortSum / sessions.length : 0;
    const averageWordsPerMinute =
      totalReadingMinutes > 0 ? Math.round(totalWords / totalReadingMinutes) : 0;

    // ── Cognitive state breakdown from session_replay_events ──
    const cognitiveBreakdown = await this._getCognitiveBreakdown(sessionIds);

    // ── Motor behaviour metrics from mouse_events ──
    const motorMetrics = await this._getMotorMetrics(sessionIds);

    const sessionCognitiveBreakdown = await this._getCognitiveBreakdownBySession(sessionIds);
    const sessionMotorMetrics = await this._getMotorMetricsBySession(sessionIds);
    for (const detail of sessionDetails) {
      detail.cognitiveBreakdown = sessionCognitiveBreakdown[detail.id] || {
        FLUENT: 0,
        REGRESSION: 0,
        DISTRACTION: 0,
      };
      detail.motorMetrics = sessionMotorMetrics[detail.id] || {
        avgVelocity: 0,
        avgDwellTime: 0,
        totalEvents: 0,
      };
    }

    const effortImprovement = this._computeEffortImprovement(sessionDetails);

    return {
      childName: child.display_name || child.email || 'Học sinh',
      periodStart: weekStart.toISOString().slice(0, 10),
      periodEnd: weekEnd.toISOString().slice(0, 10),
      totalSessions: sessions.length,
      completedSessions: completedCount,
      totalReadingMinutes,
      averageWordsPerMinute,
      averageEffortScore: this._clampScore(averageEffortScore),
      effortImprovement,
      booksRead: Array.from(booksMap.values()),
      sessionDetails,
      cognitiveBreakdown,
      motorMetrics,
    };
  }

  _clampScore(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    if (numeric < 0) return 0;
    if (numeric > 1) return 1;
    return Number(numeric.toFixed(4));
  }

  _computeEffortImprovement(sessionDetails) {
    if (!sessionDetails || sessionDetails.length < 2) {
      return {
        firstEffortScore: sessionDetails?.[0]?.effortScore || 0,
        lastEffortScore: sessionDetails?.[0]?.effortScore || 0,
        percentagePointChange: 0,
        relativePercentChange: 0,
        direction: 'NO_CHANGE',
      };
    }

    const first = this._clampScore(sessionDetails[0].effortScore);
    const last = this._clampScore(sessionDetails[sessionDetails.length - 1].effortScore);
    const percentagePointChange = Number(((last - first) * 100).toFixed(1));
    let relativePercentChange = 0;

    if (first > 0) {
      relativePercentChange = Number((((last - first) / first) * 100).toFixed(1));
    } else if (last > 0) {
      relativePercentChange = 100;
    }

    return {
      firstEffortScore: first,
      lastEffortScore: last,
      percentagePointChange,
      relativePercentChange,
      direction:
        percentagePointChange > 0
          ? 'IMPROVED'
          : percentagePointChange < 0
            ? 'DECLINED'
            : 'NO_CHANGE',
    };
  }

  /**
   * Query session_replay_events to count cognitive state classifications.
   * Returns { FLUENT: N, REGRESSION: N, DISTRACTION: N }.
   */
  async _getCognitiveBreakdown(sessionIds) {
    const breakdown = { FLUENT: 0, REGRESSION: 0, DISTRACTION: 0 };

    if (sessionIds.length === 0) return breakdown;

    try {
      const rows = await this.dataSource.query(
        `
        SELECT cognitive_state, COUNT(*)::int AS count
        FROM session_replay_events
        WHERE session_id = ANY($1)
          AND cognitive_state IS NOT NULL
        GROUP BY cognitive_state
        `,
        [sessionIds],
      );

      for (const row of rows) {
        if (Object.prototype.hasOwnProperty.call(breakdown, row.cognitive_state)) {
          breakdown[row.cognitive_state] = row.count;
        }
      }
    } catch (err) {
      // Non-fatal — report will generate without cognitive data
      logger.warn('Failed to fetch cognitive breakdown for report', {
        context: 'ReportsService',
        data: { error: err.message, sessionCount: sessionIds.length },
      });
    }

    return breakdown;
  }

  async _getCognitiveBreakdownBySession(sessionIds) {
    const breakdownBySession = {};

    if (sessionIds.length === 0) return breakdownBySession;

    try {
      const rows = await this.dataSource.query(
        `
        SELECT session_id, cognitive_state, COUNT(*)::int AS count
        FROM session_replay_events
        WHERE session_id = ANY($1)
          AND cognitive_state IS NOT NULL
        GROUP BY session_id, cognitive_state
        `,
        [sessionIds],
      );

      if (!Array.isArray(rows)) return breakdownBySession;

      for (const row of rows) {
        if (!breakdownBySession[row.session_id]) {
          breakdownBySession[row.session_id] = { FLUENT: 0, REGRESSION: 0, DISTRACTION: 0 };
        }
        if (
          Object.prototype.hasOwnProperty.call(
            breakdownBySession[row.session_id],
            row.cognitive_state,
          )
        ) {
          breakdownBySession[row.session_id][row.cognitive_state] = row.count;
        }
      }
    } catch (err) {
      logger.warn('Failed to fetch per-session cognitive breakdown for report', {
        context: 'ReportsService',
        data: { error: err.message, sessionCount: sessionIds.length },
      });
    }

    return breakdownBySession;
  }

  /**
   * Query mouse_events to compute average cursor velocity and dwell time.
   * Returns { avgVelocity, avgDwellTime, totalEvents }.
   */
  async _getMotorMetrics(sessionIds) {
    const defaults = { avgVelocity: 0, avgDwellTime: 0, totalEvents: 0 };

    if (sessionIds.length === 0) return defaults;

    try {
      const rows = await this.dataSource.query(
        `
        SELECT
          AVG(velocity)::real   AS avg_velocity,
          AVG(dwell_time)::real AS avg_dwell_time,
          COUNT(*)::int         AS total_events
        FROM mouse_events
        WHERE session_id = ANY($1)
          AND velocity IS NOT NULL
        `,
        [sessionIds],
      );

      if (rows.length > 0 && rows[0].total_events > 0) {
        return {
          avgVelocity: parseFloat(rows[0].avg_velocity) || 0,
          avgDwellTime: parseFloat(rows[0].avg_dwell_time) || 0,
          totalEvents: rows[0].total_events,
        };
      }
    } catch (err) {
      // Non-fatal — report will generate without motor data
      logger.warn('Failed to fetch motor metrics for report', {
        context: 'ReportsService',
        data: { error: err.message, sessionCount: sessionIds.length },
      });
    }

    return defaults;
  }

  async _getMotorMetricsBySession(sessionIds) {
    const metricsBySession = {};

    if (sessionIds.length === 0) return metricsBySession;

    try {
      const rows = await this.dataSource.query(
        `
        SELECT
          session_id,
          AVG(velocity)::real   AS avg_velocity,
          AVG(dwell_time)::real AS avg_dwell_time,
          COUNT(*)::int         AS total_events
        FROM mouse_events
        WHERE session_id = ANY($1)
          AND velocity IS NOT NULL
        GROUP BY session_id
        `,
        [sessionIds],
      );

      if (!Array.isArray(rows)) return metricsBySession;

      for (const row of rows) {
        metricsBySession[row.session_id] = {
          avgVelocity: parseFloat(row.avg_velocity) || 0,
          avgDwellTime: parseFloat(row.avg_dwell_time) || 0,
          totalEvents: Number(row.total_events || 0),
        };
      }
    } catch (err) {
      logger.warn('Failed to fetch per-session motor metrics for report', {
        context: 'ReportsService',
        data: { error: err.message, sessionCount: sessionIds.length },
      });
    }

    return metricsBySession;
  }
}

// ── Dependency Injection ──
const { Inject } = require('@nestjs/common');
InjectRepository(ReportEntity)(ReportsService, undefined, 0);
InjectRepository(ReadingSessionEntity)(ReportsService, undefined, 1);
InjectRepository(ReadingContentEntity)(ReportsService, undefined, 2);
InjectRepository(UserEntity)(ReportsService, undefined, 3);
Inject(GeminiService)(ReportsService, undefined, 4);
InjectDataSource()(ReportsService, undefined, 5);
Injectable()(ReportsService);

module.exports = { ReportsService };
