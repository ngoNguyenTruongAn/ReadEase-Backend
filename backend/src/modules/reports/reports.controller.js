/**
 * Reports Controller
 *
 * REST API for AI-generated reading progress reports.
 *
 * Flow:
 *   1. Clinician generates a report  → status = DRAFT
 *   2. Clinician approves the report  → status = APPROVED
 *   3. Guardian can only see APPROVED reports
 *
 * Endpoints:
 *   POST   /api/v1/reports/generate/:childId     — Generate (CLINICIAN only)
 *   PATCH  /api/v1/reports/approve/:reportId      — Approve  (CLINICIAN only)
 *   GET    /api/v1/reports/:childId               — List reports
 *   GET    /api/v1/reports/detail/:reportId        — Get single report
 */

require('reflect-metadata');

const {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Req,
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
   * Generate a weekly reading report using AI.
   * Only CLINICIAN can generate. Report starts as DRAFT.
   */
  async generateReport(childId, body) {
    const { weekStart, weekEnd } = this._resolveWeekRange(body);

    const report = await this.reportsService.generateWeeklyReport(childId, weekStart, weekEnd);

    return {
      message: 'Report generated as DRAFT. Please review and approve to send to guardian.',
      data: report,
    };
  }

  /**
   * PATCH /api/v1/reports/approve/:reportId
   *
   * Clinician approves a DRAFT report → status becomes APPROVED.
   * Guardian can then see it.
   */
  async approveReport(reportId, req) {
    const report = await this.reportsService.approveReport(reportId, req.user.sub);

    return {
      message: 'Report approved and now visible to guardian.',
      data: report,
    };
  }

  /**
   * GET /api/v1/reports/:childId
   *
   * List reports for a child.
   * - Clinician sees ALL (DRAFT + APPROVED)
   * - Guardian sees only APPROVED
   */
  async listReports(childId, req) {
    return this.reportsService.getReportsByChildId(childId, req.user);
  }

  /**
   * GET /api/v1/reports/detail/:reportId
   *
   * Retrieve a single report.
   * Guardian can only access APPROVED reports.
   */
  async getReportDetail(reportId, req) {
    return this.reportsService.getReportById(reportId, req.user);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HELPER — resolve week date range
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  _resolveWeekRange(body) {
    const now = new Date();
    let weekEnd;
    let weekStart;

    if (body?.weekEnd) {
      weekEnd = new Date(body.weekEnd);
      if (isNaN(weekEnd.getTime())) {
        throw new BadRequestException('Invalid weekEnd date format');
      }
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

// POST /api/v1/reports/generate/:childId — Generate (CLINICIAN only)
const generateReportDescriptor = Object.getOwnPropertyDescriptor(
  ReportsController.prototype,
  'generateReport',
);
Reflect.decorate(
  [Post('generate/:childId'), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_CLINICIAN')],
  ReportsController.prototype,
  'generateReport',
  generateReportDescriptor,
);
Param('childId')(ReportsController.prototype, 'generateReport', 0);
Body()(ReportsController.prototype, 'generateReport', 1);

// PATCH /api/v1/reports/approve/:reportId — Approve (CLINICIAN only)
const approveReportDescriptor = Object.getOwnPropertyDescriptor(
  ReportsController.prototype,
  'approveReport',
);
Reflect.decorate(
  [Patch('approve/:reportId'), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_CLINICIAN')],
  ReportsController.prototype,
  'approveReport',
  approveReportDescriptor,
);
Param('reportId')(ReportsController.prototype, 'approveReport', 0);
Req()(ReportsController.prototype, 'approveReport', 1);

// GET /api/v1/reports/:childId — List reports (both roles, filtered by status)
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
Req()(ReportsController.prototype, 'listReports', 1);

// GET /api/v1/reports/detail/:reportId — Single report (both roles, filtered)
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
Req()(ReportsController.prototype, 'getReportDetail', 1);

module.exports = { ReportsController };
