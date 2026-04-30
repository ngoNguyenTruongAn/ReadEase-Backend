/**
 * ReportsService Unit Tests
 *
 * Test cases:
 *   1. generateWeeklyReport — happy path (Gemini success)
 *   2. generateWeeklyReport — fallback when Gemini fails
 *   3. generateWeeklyReport — child not found (404)
 *   4. generateWeeklyReport — duplicate report guard (409)
 *   5. getReportsByChildId — returns list ordered DESC
 *   6. getReportById — found
 *   7. getReportById — not found (404)
 *   8. _aggregateSessionData — correct computation with sessions
 *   9. _aggregateSessionData — zero sessions (empty week)
 *  10. _getCognitiveBreakdown — returns correct counts
 *  11. _getCognitiveBreakdown — empty sessionIds returns zeroes
 *  12. _getCognitiveBreakdown — DB error is non-fatal
 *  13. _getMotorMetrics — returns correct averages
 *  14. _getMotorMetrics — DB error is non-fatal
 *
 * Mocking strategy:
 *   - reportRepository, sessionRepository, contentRepository, userRepository: jest mocks
 *   - geminiService: manual mock with generateWeeklyReport
 *   - dataSource: manual mock with query()
 */

const { NotFoundException, ConflictException } = require('@nestjs/common');
const { ReportsService } = require('../reports.service');

// ── Mock Factories ──────────────────────────────────────────────────────────

function makeRepoMock() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((data) => ({ id: 'report-uuid-1', ...data })),
    save: jest.fn((entity) => Promise.resolve(entity)),
  };
}

function makeGeminiMock(overrides = {}) {
  return {
    generateWeeklyReport: jest.fn().mockResolvedValue({
      content: '# Mock Report\n\nTest content in Markdown',
      model: 'gemini-2.0-flash',
      isFallback: false,
      ...overrides,
    }),
  };
}

function makeDataSourceMock(queryResults = []) {
  return {
    query: jest.fn().mockResolvedValue(queryResults),
  };
}

function buildService(overrides = {}) {
  const reportRepo = overrides.reportRepo || makeRepoMock();
  const sessionRepo = overrides.sessionRepo || makeRepoMock();
  const contentRepo = overrides.contentRepo || makeRepoMock();
  const userRepo = overrides.userRepo || makeRepoMock();
  const geminiService = overrides.geminiService || makeGeminiMock();
  const dataSource = overrides.dataSource || makeDataSourceMock();

  const svc = new ReportsService(
    reportRepo,
    sessionRepo,
    contentRepo,
    userRepo,
    geminiService,
    dataSource,
  );

  return { svc, reportRepo, sessionRepo, contentRepo, userRepo, geminiService, dataSource };
}

// ── Test Data ──────────────────────────────────────────────────────────────

const childId = '22222222-2222-4222-8222-222222222222';
const weekStart = new Date('2026-04-22T00:00:00Z');
const weekEnd = new Date('2026-04-29T23:59:59Z');

const mockChild = {
  id: childId,
  display_name: 'Child A',
  email: 'child@test.com',
  role: 'ROLE_CHILD',
};

const mockSessions = [
  {
    id: 'sess-1',
    user_id: childId,
    content_id: 'content-1',
    status: 'COMPLETED',
    started_at: new Date('2026-04-23T08:00:00Z'),
    ended_at: new Date('2026-04-23T08:15:00Z'),
    effort_score: '0.85',
    content: { title: 'Con mèo nhỏ', difficulty: 'EASY', word_count: 200 },
  },
  {
    id: 'sess-2',
    user_id: childId,
    content_id: 'content-2',
    status: 'COMPLETED',
    started_at: new Date('2026-04-25T09:00:00Z'),
    ended_at: new Date('2026-04-25T09:20:00Z'),
    effort_score: '0.65',
    content: { title: 'Hành tinh xanh', difficulty: 'MEDIUM', word_count: 350 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════════════

describe('ReportsService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── Test 1: Happy path ──────────────────────────────────────────────────

  it('should generate a weekly report successfully (Gemini success)', async () => {
    const userRepo = makeRepoMock();
    userRepo.findOne.mockResolvedValue(mockChild);

    const sessionRepo = makeRepoMock();
    sessionRepo.find.mockResolvedValue(mockSessions);

    const dataSource = makeDataSourceMock();
    // First call: cognitive breakdown
    dataSource.query
      .mockResolvedValueOnce([
        { cognitive_state: 'FLUENT', count: 80 },
        { cognitive_state: 'REGRESSION', count: 15 },
        { cognitive_state: 'DISTRACTION', count: 5 },
      ])
      // Second call: motor metrics
      .mockResolvedValueOnce([{ avg_velocity: 120.5, avg_dwell_time: 350.2, total_events: 500 }]);

    const { svc, reportRepo, geminiService } = buildService({
      userRepo,
      sessionRepo,
      dataSource,
    });

    const result = await svc.generateWeeklyReport(childId, weekStart, weekEnd);

    // Should validate child
    expect(userRepo.findOne).toHaveBeenCalledWith({
      where: { id: childId },
      select: ['id', 'display_name', 'email', 'role'],
    });

    // Should call Gemini with aggregated data including cognitive + motor
    expect(geminiService.generateWeeklyReport).toHaveBeenCalledTimes(1);
    const geminiArg = geminiService.generateWeeklyReport.mock.calls[0][0];
    expect(geminiArg.childName).toBe('Child A');
    expect(geminiArg.totalSessions).toBe(2);
    expect(geminiArg.booksRead).toHaveLength(2);
    expect(geminiArg.cognitiveBreakdown).toEqual({ FLUENT: 80, REGRESSION: 15, DISTRACTION: 5 });
    expect(geminiArg.motorMetrics.totalEvents).toBe(500);

    // Should save report
    expect(reportRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        child_id: childId,
        report_type: 'WEEKLY',
        content: '# Mock Report\n\nTest content in Markdown',
        ai_model: 'gemini-2.0-flash',
      }),
    );
    expect(reportRepo.save).toHaveBeenCalled();
    expect(result.id).toBe('report-uuid-1');
  });

  // ── Test 2: Gemini failure → fallback ──────────────────────────────────

  it('should save fallback report when Gemini returns isFallback', async () => {
    const userRepo = makeRepoMock();
    userRepo.findOne.mockResolvedValue(mockChild);

    const sessionRepo = makeRepoMock();
    sessionRepo.find.mockResolvedValue([]);

    const geminiService = makeGeminiMock({
      content: '# Fallback Report',
      model: 'fallback-local',
      isFallback: true,
    });

    const { svc, reportRepo } = buildService({ userRepo, sessionRepo, geminiService });

    const result = await svc.generateWeeklyReport(childId, weekStart, weekEnd);

    expect(reportRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '# Fallback Report',
        ai_model: 'fallback-local',
      }),
    );
    expect(result.ai_model).toBe('fallback-local');
  });

  // ── Test 3: Child not found ─────────────────────────────────────────────

  it('should throw NotFoundException when child does not exist', async () => {
    const userRepo = makeRepoMock();
    userRepo.findOne.mockResolvedValue(null);

    const { svc } = buildService({ userRepo });

    await expect(svc.generateWeeklyReport(childId, weekStart, weekEnd)).rejects.toThrow(
      NotFoundException,
    );
  });

  // ── Test 4: Duplicate report ────────────────────────────────────────────

  it('should throw ConflictException when report already exists for period', async () => {
    const userRepo = makeRepoMock();
    userRepo.findOne.mockResolvedValue(mockChild);

    const reportRepo = makeRepoMock();
    reportRepo.findOne.mockResolvedValue({ id: 'existing-report' });

    const { svc } = buildService({ userRepo, reportRepo });

    await expect(svc.generateWeeklyReport(childId, weekStart, weekEnd)).rejects.toThrow(
      ConflictException,
    );
  });

  // ── Test 5: getReportsByChildId ─────────────────────────────────────────

  it('should return list of reports ordered by period_start DESC', async () => {
    const reportRepo = makeRepoMock();
    reportRepo.find.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);

    const { svc } = buildService({ reportRepo });

    const result = await svc.getReportsByChildId(childId);

    expect(reportRepo.find).toHaveBeenCalledWith({
      where: { child_id: childId },
      order: { period_start: 'DESC' },
    });
    expect(result).toHaveLength(2);
  });

  // ── Test 6: getReportById — found ───────────────────────────────────────

  it('should return a single report by ID', async () => {
    const reportRepo = makeRepoMock();
    reportRepo.findOne.mockResolvedValue({ id: 'r1', content: '...' });

    const { svc } = buildService({ reportRepo });

    const result = await svc.getReportById('r1');

    expect(result.id).toBe('r1');
  });

  // ── Test 7: getReportById — not found ───────────────────────────────────

  it('should throw NotFoundException when report ID does not exist', async () => {
    const reportRepo = makeRepoMock();
    reportRepo.findOne.mockResolvedValue(null);

    const { svc } = buildService({ reportRepo });

    await expect(svc.getReportById('nonexistent')).rejects.toThrow(NotFoundException);
  });

  // ── Test 8: _aggregateSessionData with sessions ─────────────────────────

  it('should correctly compute aggregated data from sessions', async () => {
    const sessionRepo = makeRepoMock();
    sessionRepo.find.mockResolvedValue(mockSessions);

    const dataSource = makeDataSourceMock();
    dataSource.query.mockResolvedValue([]); // No cognitive/motor data

    const { svc } = buildService({ sessionRepo, dataSource });

    const result = await svc._aggregateSessionData(childId, mockChild, weekStart, weekEnd);

    expect(result.childName).toBe('Child A');
    expect(result.totalSessions).toBe(2);
    // 15 + 20 = 35 minutes
    expect(result.totalReadingMinutes).toBe(35);
    // (0.85 + 0.65) / 2 = 0.75
    expect(result.averageEffortScore).toBe(0.75);
    expect(result.booksRead).toHaveLength(2);
    expect(result.booksRead[0].title).toBe('Con mèo nhỏ');
    expect(result.cognitiveBreakdown).toEqual({ FLUENT: 0, REGRESSION: 0, DISTRACTION: 0 });
  });

  // ── Test 9: _aggregateSessionData with zero sessions ─────────────────

  it('should return zero values when no sessions exist', async () => {
    const sessionRepo = makeRepoMock();
    sessionRepo.find.mockResolvedValue([]);

    const { svc } = buildService({ sessionRepo });

    const result = await svc._aggregateSessionData(childId, mockChild, weekStart, weekEnd);

    expect(result.totalSessions).toBe(0);
    expect(result.totalReadingMinutes).toBe(0);
    expect(result.averageEffortScore).toBe(0);
    expect(result.averageWordsPerMinute).toBe(0);
    expect(result.booksRead).toHaveLength(0);
  });

  // ── Test 10: _getCognitiveBreakdown ──────────────────────────────────────

  it('should return correct cognitive state counts from DB', async () => {
    const dataSource = makeDataSourceMock([
      { cognitive_state: 'FLUENT', count: 100 },
      { cognitive_state: 'REGRESSION', count: 25 },
      { cognitive_state: 'DISTRACTION', count: 10 },
    ]);

    const { svc } = buildService({ dataSource });

    const result = await svc._getCognitiveBreakdown(['sess-1', 'sess-2']);

    expect(result).toEqual({ FLUENT: 100, REGRESSION: 25, DISTRACTION: 10 });
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('session_replay_events'),
      [['sess-1', 'sess-2']],
    );
  });

  // ── Test 11: _getCognitiveBreakdown with empty sessionIds ────────────────

  it('should return zeroes when sessionIds is empty', async () => {
    const dataSource = makeDataSourceMock();

    const { svc } = buildService({ dataSource });

    const result = await svc._getCognitiveBreakdown([]);

    expect(result).toEqual({ FLUENT: 0, REGRESSION: 0, DISTRACTION: 0 });
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  // ── Test 12: _getCognitiveBreakdown DB error is non-fatal ────────────────

  it('should return zeroes when cognitive query fails (non-fatal)', async () => {
    const dataSource = {
      query: jest.fn().mockRejectedValue(new Error('DB connection lost')),
    };

    const { svc } = buildService({ dataSource });

    const result = await svc._getCognitiveBreakdown(['sess-1']);

    expect(result).toEqual({ FLUENT: 0, REGRESSION: 0, DISTRACTION: 0 });
  });

  // ── Test 13: _getMotorMetrics ────────────────────────────────────────────

  it('should return correct motor averages from DB', async () => {
    const dataSource = makeDataSourceMock([
      { avg_velocity: '145.3', avg_dwell_time: '280.7', total_events: 1200 },
    ]);

    const { svc } = buildService({ dataSource });

    const result = await svc._getMotorMetrics(['sess-1']);

    expect(result.avgVelocity).toBeCloseTo(145.3);
    expect(result.avgDwellTime).toBeCloseTo(280.7);
    expect(result.totalEvents).toBe(1200);
  });

  // ── Test 14: _getMotorMetrics DB error is non-fatal ──────────────────────

  it('should return defaults when motor query fails (non-fatal)', async () => {
    const dataSource = {
      query: jest.fn().mockRejectedValue(new Error('DB timeout')),
    };

    const { svc } = buildService({ dataSource });

    const result = await svc._getMotorMetrics(['sess-1']);

    expect(result).toEqual({ avgVelocity: 0, avgDwellTime: 0, totalEvents: 0 });
  });
});
