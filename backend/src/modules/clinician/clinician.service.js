const { Injectable } = require('@nestjs/common');
const { InjectDataSource } = require('@nestjs/typeorm');

class ClinicianService {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  async getDashboard() {
    const [monitoredPatientsRows, pendingReportsRows, abnormalSessionsRows, recentReportRows] =
      await Promise.all([
        this.dataSource.query(
          `
          SELECT COUNT(*)::int AS count
          FROM users
          WHERE role = 'ROLE_CHILD'
            AND deleted_at IS NULL
          `,
        ),
        this.dataSource.query(
          `
          SELECT COUNT(*)::int AS count
          FROM reports
          WHERE COALESCE(status, 'DRAFT') <> 'APPROVED'
          `,
        ),
        this.dataSource.query(
          `
          SELECT COUNT(*)::int AS count
          FROM (
            SELECT
              rs.id,
              COALESCE(
                NULLIF(rs.cognitive_state_summary #>> '{state_counts,FLUENT}', '')::int,
                NULLIF(rs.cognitive_state_summary ->> 'FLUENT', '')::int,
                0
              ) AS fluent_count,
              COALESCE(
                NULLIF(rs.cognitive_state_summary #>> '{state_counts,REGRESSION}', '')::int,
                NULLIF(rs.cognitive_state_summary ->> 'REGRESSION', '')::int,
                0
              ) AS regression_count,
              COALESCE(
                NULLIF(rs.cognitive_state_summary #>> '{state_counts,DISTRACTION}', '')::int,
                NULLIF(rs.cognitive_state_summary ->> 'DISTRACTION', '')::int,
                0
              ) AS distraction_count,
              COALESCE(rs.effort_score::numeric, 0) AS effort_score
            FROM reading_sessions rs
            WHERE rs.started_at >= NOW() - INTERVAL '7 days'
          ) recent_sessions
          WHERE effort_score < 0.5
             OR (regression_count + distraction_count) > fluent_count
          `,
        ),
        this.dataSource.query(
          `
          SELECT
            r.id,
            r.child_id,
            COALESCE(c.display_name, c.email, 'Học sinh') AS child_name,
            r.report_type,
            r.status,
            r.period_start,
            r.period_end,
            r.created_at
          FROM reports r
          LEFT JOIN users c ON c.id = r.child_id
          ORDER BY r.created_at DESC
          LIMIT 5
          `,
        ),
      ]);

    return {
      stats: {
        monitoredPatients: this.toCount(monitoredPatientsRows),
        pendingReports: this.toCount(pendingReportsRows),
        abnormalSessions: this.toCount(abnormalSessionsRows),
      },
      recentReports: recentReportRows.map((row) => this.mapRecentReport(row)),
    };
  }

  toCount(rows) {
    return Number(rows?.[0]?.count || 0);
  }

  mapRecentReport(row) {
    const childName = row.child_name || 'Học sinh';
    const periodStart = this.toIsoDate(row.period_start);
    const periodEnd = this.toIsoDate(row.period_end);
    const status = String(row.status || 'DRAFT').toUpperCase();

    return {
      id: row.id,
      childId: row.child_id,
      childName,
      title: this.buildReportTitle(periodEnd, row.report_type),
      subtitle: `${childName}: ${this.buildPeriodSubtitle(periodStart, periodEnd)}`,
      status,
      periodStart,
      periodEnd,
      createdAt: this.toIsoDateTime(row.created_at),
    };
  }

  buildReportTitle(periodEnd, reportType) {
    const date = periodEnd ? new Date(periodEnd) : null;
    if (date && !Number.isNaN(date.getTime())) {
      const week = Math.max(1, Math.ceil(date.getUTCDate() / 7));
      return `Báo cáo Đánh giá Tuần ${week} - Tháng ${date.getUTCMonth() + 1}`;
    }

    return String(reportType || '').toUpperCase() === 'WEEKLY' ? 'Báo cáo tuần' : 'Báo cáo';
  }

  buildPeriodSubtitle(periodStart, periodEnd) {
    if (periodStart && periodEnd) return `${periodStart} đến ${periodEnd}`;
    if (periodEnd) return `Đến ${periodEnd}`;
    return 'Chưa có khoảng thời gian';
  }

  toIsoDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }

    const text = String(value);
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    return text.slice(0, 10);
  }

  toIsoDateTime(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
    return String(value);
  }
}

Injectable()(ClinicianService);
InjectDataSource()(ClinicianService, undefined, 0);

module.exports = { ClinicianService };
