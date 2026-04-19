/**
 * Reports Service
 *
 * Aggregates reading session data for a given child and week,
 * calls GeminiService to generate a Markdown report,
 * and persists the result into the reports table.
 */

const {
  Injectable,
  NotFoundException,
  ConflictException,
} = require('@nestjs/common');
const { InjectRepository } = require('@nestjs/typeorm');
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
  ) {
    this.reportRepository = reportRepository;
    this.sessionRepository = sessionRepository;
    this.contentRepository = contentRepository;
    this.userRepository = userRepository;
    this.geminiService = geminiService;
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

    // ── 3. Data aggregation ──
    const aggregatedData = await this._aggregateSessionData(childId, child, weekStart, weekEnd);

    logger.info('Reading data aggregated for report', {
      context: 'ReportsService',
      data: {
        childId,
        totalSessions: aggregatedData.totalSessions,
        totalMinutes: aggregatedData.totalReadingMinutes,
        booksCount: aggregatedData.booksRead.length,
      },
    });

    // ── 4. Generate report via Gemini ──
    const aiResult = await this.geminiService.generateWeeklyReport(aggregatedData);

    // ── 5. Persist the report ──
    const report = this.reportRepository.create({
      child_id: childId,
      report_type: 'WEEKLY',
      content: aiResult.content,
      ai_model: aiResult.model,
      period_start: weekStart,
      period_end: weekEnd,
    });

    await this.reportRepository.save(report);

    logger.info('Weekly report saved', {
      context: 'ReportsService',
      data: {
        reportId: report.id,
        childId,
        model: aiResult.model,
        isFallback: aiResult.isFallback,
      },
    });

    return report;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // LIST REPORTS FOR A CHILD
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Retrieve all reports for a specific child, ordered by period descending.
   */
  async getReportsByChildId(childId) {
    return this.reportRepository.find({
      where: { child_id: childId },
      order: { period_start: 'DESC' },
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET SINGLE REPORT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Retrieve a single report by its UUID.
   */
  async getReportById(reportId) {
    const report = await this.reportRepository.findOne({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException(`Report ${reportId} not found`);
    }

    return report;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PRIVATE: DATA AGGREGATION
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Query ReadingSession + ReadingContent to build the aggregated
   * statistics that the Gemini prompt requires.
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

    for (const session of sessions) {
      // Calculate reading duration
      if (session.ended_at && session.started_at) {
        const durationMs =
          new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
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
    }

    const totalReadingMinutes = Math.round(totalReadingMs / 60000);
    const averageEffortScore = sessions.length > 0 ? effortSum / sessions.length : 0;
    const averageWordsPerMinute =
      totalReadingMinutes > 0 ? Math.round(totalWords / totalReadingMinutes) : 0;

    return {
      childName: child.display_name || child.email || 'Học sinh',
      periodStart: weekStart.toISOString().slice(0, 10),
      periodEnd: weekEnd.toISOString().slice(0, 10),
      totalSessions: completedCount,
      totalReadingMinutes,
      averageWordsPerMinute,
      averageEffortScore,
      booksRead: Array.from(booksMap.values()),
    };
  }
}

// ── Dependency Injection ──
const { Inject } = require('@nestjs/common');
InjectRepository(ReportEntity)(ReportsService, undefined, 0);
InjectRepository(ReadingSessionEntity)(ReportsService, undefined, 1);
InjectRepository(ReadingContentEntity)(ReportsService, undefined, 2);
InjectRepository(UserEntity)(ReportsService, undefined, 3);
Inject(GeminiService)(ReportsService, undefined, 4);
Injectable()(ReportsService);

module.exports = { ReportsService };
