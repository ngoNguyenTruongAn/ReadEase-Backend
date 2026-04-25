/**
 * Reports Controller
 *
 * REST API for AI-generated reading progress reports.
 *
 * Endpoints:
 *   POST  /api/v1/reports/generate/:childId  — Generate weekly report
 *   GET   /api/v1/reports/:childId           — List reports for a child
 *   GET   /api/v1/reports/detail/:reportId   — Get single report
 */

require('reflect-metadata');

const {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  Inject,
} = require('@nestjs/common');

const { ReportsService } = require('./reports.service');
const { JwtAuthGuard } = require('../auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../auth/guards/roles.guard');
const { Roles } = require('../auth/decorators/roles.decorator');

class ReportsController {
  constructor(reportsService) {
    this.reportsService = reportsService;
  }

  /**
   * POST /api/v1/reports/generate/:childId
   *
   * Generate a weekly reading report using Gemini AI.
   * Body (optional): { weekStart: "2026-04-07", weekEnd: "2026-04-14" }
   * Defaults to the past 7 days if not provided.
   */
  async generateReport(childId, body) {
    const { weekStart, weekEnd } = this._resolveWeekRange(body);

    const report = await this.reportsService.generateWeeklyReport(childId, weekStart, weekEnd);

    return {
      message: 'Weekly reading report generated successfully',
      data: report,
    };
  }

  /**
   * GET /api/v1/reports/:childId
   *
   * List all reports for a given child, ordered by newest first.
   */
  async listReports(childId) {
    return this.reportsService.getReportsByChildId(childId);
  }

  /**
   * GET /api/v1/reports/detail/:reportId
   *
   * Retrieve a single report by its UUID.
   */
  async getReportDetail(reportId) {
    return this.reportsService.getReportById(reportId);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HELPER — resolve week date range
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Parse weekStart / weekEnd from the request body.
   * Falls back to the last 7 days if not provided.
   */
  _resolveWeekRange(body) {
    const now = new Date();
    let weekEnd;
    let weekStart;

    if (body?.weekEnd) {
      weekEnd = new Date(body.weekEnd);
      if (isNaN(weekEnd.getTime())) {
        throw new BadRequestException('Invalid weekEnd date format');
      }
      // If only a date string was provided (no time component), set to end of day
      // so that sessions created on this day are included in the range
      if (typeof body.weekEnd === 'string' && body.weekEnd.length <= 10) {
        weekEnd.setHours(23, 59, 59, 999);
      }
    } else {
      weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    }

    if (body?.weekStart) {
      weekStart = new Date(body.weekStart);
      if (isNaN(weekStart.getTime())) {
        throw new BadRequestException('Invalid weekStart date format');
      }
      // If only a date string was provided, set to start of day
      if (typeof body.weekStart === 'string' && body.weekStart.length <= 10) {
        weekStart.setHours(0, 0, 0, 0);
      }
    } else {
      weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);
    }

    if (weekStart >= weekEnd) {
      throw new BadRequestException('weekStart must be before weekEnd');
    }

    return { weekStart, weekEnd };
  }
}

// ── NestJS Decorators (JavaScript style) ──

Controller('api/v1/reports')(ReportsController);
Inject(ReportsService)(ReportsController, undefined, 0);

// POST /api/v1/reports/generate/:childId — Generate report
const generateReportDescriptor = Object.getOwnPropertyDescriptor(
  ReportsController.prototype,
  'generateReport',
);
Reflect.decorate(
  [
    Post('generate/:childId'),
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ROLE_CLINICIAN', 'ROLE_GUARDIAN'),
  ],
  ReportsController.prototype,
  'generateReport',
  generateReportDescriptor,
);
Param('childId')(ReportsController.prototype, 'generateReport', 0);
Body()(ReportsController.prototype, 'generateReport', 1);

// GET /api/v1/reports/:childId — List reports
const listReportsDescriptor = Object.getOwnPropertyDescriptor(
  ReportsController.prototype,
  'listReports',
);
Reflect.decorate(
  [Get(':childId'), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_CLINICIAN', 'ROLE_GUARDIAN')],
  ReportsController.prototype,
  'listReports',
  listReportsDescriptor,
);
Param('childId')(ReportsController.prototype, 'listReports', 0);

// GET /api/v1/reports/detail/:reportId — Single report
const getReportDetailDescriptor = Object.getOwnPropertyDescriptor(
  ReportsController.prototype,
  'getReportDetail',
);
Reflect.decorate(
  [
    Get('detail/:reportId'),
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ROLE_CLINICIAN', 'ROLE_GUARDIAN'),
  ],
  ReportsController.prototype,
  'getReportDetail',
  getReportDetailDescriptor,
);
Param('reportId')(ReportsController.prototype, 'getReportDetail', 0);

module.exports = { ReportsController };
