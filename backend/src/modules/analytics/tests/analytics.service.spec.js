const { NotFoundException, ForbiddenException } = require('@nestjs/common');
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
});
