const { NotFoundException } = require('@nestjs/common');
const { AnalyticsService } = require('../analytics.service');

describe('AnalyticsService', () => {
  let service;
  let mockDataSource;

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn(),
    };

    service = new AnalyticsService(mockDataSource);
  });

  // ══════════════════════════════════════════════════════════════════
  //  Existing heatmap tests
  // ══════════════════════════════════════════════════════════════════

  // ── Test 1: Returns correct difficulty scores ──
  it('should return correct per-word difficulty scores', async () => {
    // Session query
    mockDataSource.query.mockResolvedValueOnce([
      {
        id: 'sess-1',
        user_id: 'child-1',
        content_id: 'content-1',
        created_at: '2026-03-23T10:00:00Z',
        body: 'Con mèo bướm',
        title: 'Test Story',
      },
    ]);

    // Word stats query
    mockDataSource.query.mockResolvedValueOnce([
      { word_index: 0, regression_count: '0', total_dwell_ms: '200', event_count: '5' },
      { word_index: 1, regression_count: '1', total_dwell_ms: '400', event_count: '8' },
      { word_index: 2, regression_count: '5', total_dwell_ms: '3200', event_count: '20' },
    ]);

    const result = await service.getHeatmap('child-1', 'sess-1');

    expect(result.child_id).toBe('child-1');
    expect(result.session_id).toBe('sess-1');
    expect(result.total_words).toBe(3);
    expect(result.words).toHaveLength(3);

    // "Con" — 0 regressions, 200ms dwell → lowest score
    expect(result.words[0].text).toBe('Con');
    expect(result.words[0].difficulty).toBeLessThan(0.1);

    // "bướm" — 5 regressions, 3200ms dwell → highest score (1.0)
    expect(result.words[2].text).toBe('bướm');
    expect(result.words[2].difficulty).toBe(1);

    // Summary
    expect(result.summary.hardest_words[0]).toBe('bướm');
    expect(result.summary.total_regressions).toBe(6);
  });

  // ── Test 2: Session not found → 404 ──
  it('should throw NotFoundException when session does not exist', async () => {
    mockDataSource.query.mockResolvedValueOnce([]);

    await expect(service.getHeatmap('child-1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });

  // ── Test 3: Session belongs to different child → 403 ──
  it('should throw ForbiddenException when session belongs to a different child', async () => {
    mockDataSource.query.mockResolvedValueOnce([
      {
        id: 'sess-1',
        user_id: 'other-child',
        content_id: 'content-1',
        created_at: '2026-03-23T10:00:00Z',
        body: 'Hello world',
        title: 'Test',
      },
    ]);

    const { ForbiddenException } = require('@nestjs/common');
    await expect(service.getHeatmap('child-1', 'sess-1')).rejects.toThrow(ForbiddenException);
  });

  // ── Test 4: No mouse events → all difficulties = 0 ──
  it('should return all zeros when no mouse events exist', async () => {
    mockDataSource.query.mockResolvedValueOnce([
      {
        id: 'sess-1',
        user_id: 'child-1',
        content_id: 'content-1',
        created_at: '2026-03-23T10:00:00Z',
        body: 'Hello world test',
        title: 'Test',
      },
    ]);

    // No word stats
    mockDataSource.query.mockResolvedValueOnce([]);

    const result = await service.getHeatmap('child-1', 'sess-1');

    expect(result.words).toHaveLength(3);
    result.words.forEach((word) => {
      expect(word.difficulty).toBe(0);
      expect(word.regressions).toBe(0);
      expect(word.dwell_ms).toBe(0);
    });

    expect(result.summary.avg_difficulty).toBe(0);
    expect(result.summary.total_regressions).toBe(0);
  });

  // ── Test 5: Scores normalized to 0.0–1.0 range ──
  it('should normalize difficulty scores to 0.0–1.0 range', async () => {
    mockDataSource.query.mockResolvedValueOnce([
      {
        id: 'sess-1',
        user_id: 'child-1',
        content_id: 'content-1',
        created_at: '2026-03-23T10:00:00Z',
        body: 'word1 word2 word3 word4 word5',
        title: 'Test',
      },
    ]);

    mockDataSource.query.mockResolvedValueOnce([
      { word_index: 0, regression_count: '10', total_dwell_ms: '5000', event_count: '50' },
      { word_index: 1, regression_count: '3', total_dwell_ms: '1500', event_count: '20' },
      { word_index: 2, regression_count: '0', total_dwell_ms: '100', event_count: '2' },
      { word_index: 3, regression_count: '7', total_dwell_ms: '3000', event_count: '30' },
      { word_index: 4, regression_count: '1', total_dwell_ms: '800', event_count: '10' },
    ]);

    const result = await service.getHeatmap('child-1', 'sess-1');

    result.words.forEach((word) => {
      expect(word.difficulty).toBeGreaterThanOrEqual(0);
      expect(word.difficulty).toBeLessThanOrEqual(1);
    });

    // word1 has max regressions (10) and max dwell (5000) → score = 1.0
    expect(result.words[0].difficulty).toBe(1);

    // word3 has 0 regressions + very low dwell → closest to 0
    expect(result.words[2].difficulty).toBeLessThan(0.1);
  });

  // ══════════════════════════════════════════════════════════════════
  //  [S2-T04] Session Replay tests
  // ══════════════════════════════════════════════════════════════════

  describe('getSessionReplay', () => {
    it('should return replay events ordered with session summary', async () => {
      // Session metadata query
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'sess-1',
          user_id: 'child-1',
          content_id: 'content-1',
          status: 'COMPLETED',
          started_at: '2026-03-28T10:00:00Z',
          ended_at: '2026-03-28T10:05:00Z',
          effort_score: '0.82',
          cognitive_state_summary: { FLUENT: 10, REGRESSION: 3 },
          content_title: 'Test Story',
        },
      ]);

      // Replay events query
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: '1',
          event_type: 'mouse_move',
          payload: { x: 100, y: 200 },
          cognitive_state: 'FLUENT',
          intervention_type: null,
          timestamp: '1711612800000',
          created_at: '2026-03-28T10:00:00Z',
        },
        {
          id: '2',
          event_type: 'mouse_move',
          payload: { x: 150, y: 200 },
          cognitive_state: 'REGRESSION',
          intervention_type: 'DUAL',
          timestamp: '1711612801000',
          created_at: '2026-03-28T10:00:01Z',
        },
        {
          id: '3',
          event_type: 'mouse_move',
          payload: { x: 200, y: 200 },
          cognitive_state: 'FLUENT',
          intervention_type: null,
          timestamp: '1711612802000',
          created_at: '2026-03-28T10:00:02Z',
        },
      ]);

      const result = await service.getSessionReplay('sess-1');

      // Session metadata
      expect(result.session.id).toBe('sess-1');
      expect(result.session.status).toBe('COMPLETED');
      expect(result.session.effort_score).toBe(0.82);
      expect(result.session.duration_ms).toBe(300000); // 5 minutes

      // Events
      expect(result.events).toHaveLength(3);

      // Summary
      expect(result.summary.total_events).toBe(3);
      expect(result.summary.cognitive_state_counts.FLUENT).toBe(2);
      expect(result.summary.cognitive_state_counts.REGRESSION).toBe(1);
      expect(result.summary.intervention_counts.DUAL).toBe(1);
    });

    it('should throw NotFoundException for missing session', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.getSessionReplay('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should handle session with no replay events', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'sess-2',
          user_id: 'child-1',
          content_id: 'content-1',
          status: 'ACTIVE',
          started_at: '2026-03-28T10:00:00Z',
          ended_at: null,
          effort_score: '0',
          cognitive_state_summary: null,
          content_title: 'Test',
        },
      ]);

      // No events
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.getSessionReplay('sess-2');

      expect(result.events).toHaveLength(0);
      expect(result.summary.total_events).toBe(0);
      expect(result.summary.cognitive_state_counts).toEqual({});
      expect(result.summary.intervention_counts).toEqual({});
      expect(result.session.duration_ms).toBeNull();
    });
  });

  // ══════════════════════════════════════════════════════════════════
  //  [S2-T04] Child Sessions List tests
  // ══════════════════════════════════════════════════════════════════

  describe('getChildSessions', () => {
    it('should return paginated sessions for a child', async () => {
      // Count query
      mockDataSource.query.mockResolvedValueOnce([{ total: 25 }]);

      // Data query
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'sess-1',
          user_id: 'child-1',
          content_id: 'c-1',
          status: 'COMPLETED',
          started_at: '2026-03-28T10:00:00Z',
          ended_at: '2026-03-28T10:05:00Z',
          effort_score: '0.85',
          cognitive_state_summary: { FLUENT: 10 },
          content_title: 'Story 1',
        },
        {
          id: 'sess-2',
          user_id: 'child-1',
          content_id: 'c-2',
          status: 'ACTIVE',
          started_at: '2026-03-28T11:00:00Z',
          ended_at: null,
          effort_score: '0',
          cognitive_state_summary: {},
          content_title: 'Story 2',
        },
      ]);

      const result = await service.getChildSessions('child-1', 10, 0, undefined);

      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('sess-1');
      expect(result.data[0].effort_score).toBe(0.85);
      expect(result.meta.total).toBe(25);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.offset).toBe(0);
    });

    it('should filter by status when provided', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ total: 5 }]);
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.getChildSessions('child-1', 20, 0, 'COMPLETED');

      // Verify the count query includes status filter
      const countCall = mockDataSource.query.mock.calls[0];
      expect(countCall[0]).toContain('rs.status = $2');
      expect(countCall[1]).toEqual(['child-1', 'COMPLETED']);
    });

    it('should return empty data for child with no sessions', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ total: 0 }]);
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.getChildSessions('child-1', 20, 0, undefined);

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  //  [S2-T04] Trends tests
  // ══════════════════════════════════════════════════════════════════

  describe('getTrends', () => {
    it('should return daily trend data with cognitive state distribution', async () => {
      // Daily sessions query
      mockDataSource.query.mockResolvedValueOnce([
        { date: '2026-03-27', session_count: 2, avg_effort_score: '0.75' },
        { date: '2026-03-28', session_count: 3, avg_effort_score: '0.82' },
      ]);

      // Cognitive state distribution query
      mockDataSource.query.mockResolvedValueOnce([
        { date: '2026-03-27', cognitive_state: 'FLUENT', count: 40 },
        { date: '2026-03-27', cognitive_state: 'REGRESSION', count: 10 },
        { date: '2026-03-28', cognitive_state: 'FLUENT', count: 55 },
        { date: '2026-03-28', cognitive_state: 'REGRESSION', count: 8 },
        { date: '2026-03-28', cognitive_state: 'DISTRACTION', count: 3 },
      ]);

      const result = await service.getTrends('child-1', 7);

      expect(result.child_id).toBe('child-1');
      expect(result.window_days).toBe(7);
      expect(result.daily).toHaveLength(2);

      // Day 1
      expect(result.daily[0].date).toBe('2026-03-27');
      expect(result.daily[0].session_count).toBe(2);
      expect(result.daily[0].avg_effort_score).toBe(0.75);
      expect(result.daily[0].cognitive_state_distribution.FLUENT).toBe(40);
      expect(result.daily[0].cognitive_state_distribution.REGRESSION).toBe(10);

      // Day 2
      expect(result.daily[1].date).toBe('2026-03-28');
      expect(result.daily[1].cognitive_state_distribution.DISTRACTION).toBe(3);

      // Summary
      expect(result.summary.total_sessions).toBe(5);
      expect(result.summary.days_with_sessions).toBe(2);
      expect(result.summary.avg_effort_score).toBeGreaterThan(0);
    });

    it('should return empty trends for child with no sessions in window', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.getTrends('child-1', 7);

      expect(result.daily).toHaveLength(0);
      expect(result.summary.total_sessions).toBe(0);
      expect(result.summary.days_with_sessions).toBe(0);
      expect(result.summary.avg_effort_score).toBe(0);
    });

    it('should correctly weight avg_effort_score by session count', async () => {
      // Day 1: 1 session at 0.90. Day 2: 4 sessions at 0.70
      // Weighted avg = (1*0.90 + 4*0.70) / 5 = 3.70 / 5 = 0.74
      mockDataSource.query.mockResolvedValueOnce([
        { date: '2026-03-27', session_count: 1, avg_effort_score: '0.90' },
        { date: '2026-03-28', session_count: 4, avg_effort_score: '0.70' },
      ]);

      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.getTrends('child-1', 7);

      expect(result.summary.avg_effort_score).toBeCloseTo(0.74, 2);
    });
  });
});
