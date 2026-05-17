const { ClinicianService } = require('../clinician.service');

describe('ClinicianService', () => {
  let dataSource;
  let service;

  beforeEach(() => {
    dataSource = {
      query: jest.fn(),
    };
    service = new ClinicianService(dataSource);
  });

  it('should return dashboard stats from database counts', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ count: 12 }])
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([]);

    const result = await service.getDashboard();

    expect(result.stats).toEqual({
      monitoredPatients: 12,
      pendingReports: 3,
      abnormalSessions: 1,
    });
    expect(result.recentReports).toEqual([]);
    expect(dataSource.query).toHaveBeenCalledTimes(4);
  });

  it('should count only child users that are not deleted', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([]);

    await service.getDashboard();

    expect(dataSource.query.mock.calls[0][0]).toContain("role = 'ROLE_CHILD'");
    expect(dataSource.query.mock.calls[0][0]).toContain('deleted_at IS NULL');
  });

  it('should count reports that are not approved as pending', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 4 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([]);

    await service.getDashboard();

    expect(dataSource.query.mock.calls[1][0]).toContain("COALESCE(status, 'DRAFT') <> 'APPROVED'");
  });

  it('should count recent abnormal sessions by effort or cognitive distribution', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 5 }])
      .mockResolvedValueOnce([]);

    await service.getDashboard();

    const abnormalSql = dataSource.query.mock.calls[2][0];
    expect(abnormalSql).toContain("NOW() - INTERVAL '7 days'");
    expect(abnormalSql).toContain('effort_score < 0.5');
    expect(abnormalSql).toContain('(regression_count + distraction_count) > fluent_count');
  });

  it('should map recent reports with child name and newest query order', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([
        {
          id: 'report-1',
          child_id: 'child-1',
          child_name: 'An',
          report_type: 'WEEKLY',
          status: 'DRAFT',
          period_start: '2026-05-04',
          period_end: '2026-05-10',
          created_at: '2026-05-11T08:00:00.000Z',
        },
      ]);

    const result = await service.getDashboard();

    expect(dataSource.query.mock.calls[3][0]).toContain('ORDER BY r.created_at DESC');
    expect(dataSource.query.mock.calls[3][0]).toContain('LIMIT 5');
    expect(result.recentReports).toEqual([
      {
        id: 'report-1',
        childId: 'child-1',
        childName: 'An',
        title: 'Báo cáo Đánh giá Tuần 2 - Tháng 5',
        subtitle: 'An: 2026-05-04 đến 2026-05-10',
        status: 'DRAFT',
        periodStart: '2026-05-04',
        periodEnd: '2026-05-10',
        createdAt: '2026-05-11T08:00:00.000Z',
      },
    ]);
  });
});
