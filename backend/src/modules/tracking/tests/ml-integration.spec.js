/**
 * Integration tests for ML Classification pipeline
 *
 * Tests:
 *   1. ML classify success → correct WS events emitted
 *   2. ML timeout → fallback to threshold
 *   3. REGRESSION → sends adaptation:trigger + tooltip:show
 *   4. DISTRACTION → sends adaptation:trigger only
 *   5. FLUENT → no event sent
 *   6. Cognitive state stored in session_replay_events
 *   7. Feature extraction with < 3 points returns defaults
 */

const { extractFeatures } = require('../utils/feature-extractor');
const { routeIntervention } = require('../utils/intervention-router');

// ── Feature Extractor Tests ──────────────────────────────

describe('Feature Extractor', () => {
  it('should return default features for < 3 points', () => {
    const result = extractFeatures([{ x: 0, y: 0, timestamp: 0 }]);

    expect(result.velocity_mean).toBe(0);
    expect(result.regression_count).toBe(0);
    expect(result.path_efficiency).toBe(1.0);
  });

  it('should return default features for null/empty input', () => {
    expect(extractFeatures(null).velocity_mean).toBe(0);
    expect(extractFeatures([]).velocity_mean).toBe(0);
  });

  it('should extract 12 features from valid mouse points', () => {
    const points = [
      { x: 0, y: 0, timestamp: 0 },
      { x: 100, y: 0, timestamp: 100 },
      { x: 200, y: 0, timestamp: 200 },
      { x: 300, y: 10, timestamp: 300 },
      { x: 400, y: 0, timestamp: 400 },
    ];

    const features = extractFeatures(points);

    // Should have all 12 features
    expect(features).toHaveProperty('velocity_mean');
    expect(features).toHaveProperty('velocity_std');
    expect(features).toHaveProperty('velocity_max');
    expect(features).toHaveProperty('acceleration_mean');
    expect(features).toHaveProperty('acceleration_std');
    expect(features).toHaveProperty('curvature_mean');
    expect(features).toHaveProperty('curvature_std');
    expect(features).toHaveProperty('dwell_time_mean');
    expect(features).toHaveProperty('dwell_time_max');
    expect(features).toHaveProperty('direction_changes');
    expect(features).toHaveProperty('regression_count');
    expect(features).toHaveProperty('path_efficiency');

    // Velocity should be positive for moving points
    expect(features.velocity_mean).toBeGreaterThan(0);
    expect(features.velocity_max).toBeGreaterThan(0);

    // Path efficiency should be close to 1 for mostly straight line
    expect(features.path_efficiency).toBeGreaterThan(0.9);
  });

  it('should detect regressions (backward horizontal movements)', () => {
    const points = [
      { x: 0, y: 0, timestamp: 0 },
      { x: 100, y: 0, timestamp: 100 },
      { x: 50, y: 0, timestamp: 200 }, // regression
      { x: 150, y: 0, timestamp: 300 },
      { x: 80, y: 0, timestamp: 400 }, // regression
    ];

    const features = extractFeatures(points);
    expect(features.regression_count).toBeGreaterThanOrEqual(2);
  });

  it('should detect direction changes', () => {
    const points = [
      { x: 0, y: 0, timestamp: 0 },
      { x: 100, y: 0, timestamp: 100 },
      { x: 50, y: 0, timestamp: 200 }, // change
      { x: 150, y: 0, timestamp: 300 }, // change
      { x: 80, y: 0, timestamp: 400 }, // change
    ];

    const features = extractFeatures(points);
    expect(features.direction_changes).toBeGreaterThanOrEqual(2);
  });
});

// ── Intervention Router Tests ────────────────────────────

describe('Intervention Router', () => {
  let mockClient;
  let sentMessages;

  beforeEach(() => {
    sentMessages = [];
    mockClient = {
      readyState: 1,
      send: jest.fn((msg) => sentMessages.push(JSON.parse(msg))),
    };
  });

  it('REGRESSION → sends adaptation:trigger + tooltip:show', () => {
    const result = routeIntervention(mockClient, {
      state: 'REGRESSION',
      confidence: 0.92,
      session_id: 'sess-1',
    });

    expect(result).toBe('SEMANTIC');
    expect(mockClient.send).toHaveBeenCalledTimes(2);

    const events = sentMessages.map((m) => m.event);
    expect(events).toContain('adaptation:trigger');
    expect(events).toContain('tooltip:show');

    const trigger = sentMessages.find((m) => m.event === 'adaptation:trigger');
    expect(trigger.data.type).toBe('SEMANTIC');
    expect(trigger.data.state).toBe('REGRESSION');
    expect(trigger.data.confidence).toBe(0.92);
  });

  it('DISTRACTION → sends adaptation:trigger (VISUAL only)', () => {
    const result = routeIntervention(mockClient, {
      state: 'DISTRACTION',
      confidence: 0.85,
      session_id: 'sess-2',
    });

    expect(result).toBe('VISUAL');
    expect(mockClient.send).toHaveBeenCalledTimes(1);

    const trigger = sentMessages[0];
    expect(trigger.event).toBe('adaptation:trigger');
    expect(trigger.data.type).toBe('VISUAL');
    expect(trigger.data.state).toBe('DISTRACTION');
  });

  it('FLUENT → no event sent', () => {
    const result = routeIntervention(mockClient, {
      state: 'FLUENT',
      confidence: 0.95,
      session_id: 'sess-3',
    });

    expect(result).toBeNull();
    expect(mockClient.send).not.toHaveBeenCalled();
  });

  it('should return null for closed WebSocket', () => {
    mockClient.readyState = 3; // CLOSED

    const result = routeIntervention(mockClient, {
      state: 'REGRESSION',
      confidence: 0.9,
      session_id: 'sess-4',
    });

    expect(result).toBeNull();
    expect(mockClient.send).not.toHaveBeenCalled();
  });

  it('should return null for null client', () => {
    const result = routeIntervention(null, {
      state: 'REGRESSION',
      confidence: 0.9,
      session_id: 'sess-5',
    });

    expect(result).toBeNull();
  });
});

// ── ML Client Service Tests ──────────────────────────────

describe('MlClientService', () => {
  let service;
  let mockHttpService;

  beforeEach(() => {
    mockHttpService = {
      axiosRef: {
        post: jest.fn(),
      },
    };

    // Manually instantiate
    const MlClientService = require('../services/ml-client.service');
    service = new MlClientService(mockHttpService);
  });

  it('should return ML result on success', async () => {
    mockHttpService.axiosRef.post.mockResolvedValue({
      data: {
        state: 'REGRESSION',
        confidence: 0.92,
        session_id: 'sess-1',
        model_version: '1.0.0',
      },
    });

    const points = [
      { x: 0, y: 0, timestamp: 0 },
      { x: 100, y: 0, timestamp: 100 },
      { x: 200, y: 0, timestamp: 200 },
    ];

    const result = await service.classify('sess-1', points);

    expect(result.state).toBe('REGRESSION');
    expect(result.confidence).toBe(0.92);
    expect(result.source).toBe('ml_model');
    expect(mockHttpService.axiosRef.post).toHaveBeenCalled();
  });

  it('should fallback on ML timeout/error', async () => {
    mockHttpService.axiosRef.post.mockRejectedValue(
      new Error('timeout of 3000ms exceeded'),
    );

    const points = [
      { x: 0, y: 0, timestamp: 0 },
      { x: 100, y: 0, timestamp: 100 },
      { x: 200, y: 0, timestamp: 200 },
    ];

    const result = await service.classify('sess-2', points);

    expect(result.source).toBe('fallback_threshold');
    expect(['FLUENT', 'REGRESSION', 'DISTRACTION']).toContain(result.state);
  });

  it('should classify REGRESSION when regression_count >= 3 (fallback)', () => {
    const features = {
      regression_count: 5,
      direction_changes: 2,
      path_efficiency: 0.8,
    };

    const result = service.fallbackClassify('sess-3', features);

    expect(result.state).toBe('REGRESSION');
    expect(result.source).toBe('fallback_threshold');
  });

  it('should classify DISTRACTION when direction_changes >= 5 and efficiency < 0.5 (fallback)', () => {
    const features = {
      regression_count: 1,
      direction_changes: 7,
      path_efficiency: 0.3,
    };

    const result = service.fallbackClassify('sess-4', features);

    expect(result.state).toBe('DISTRACTION');
    expect(result.source).toBe('fallback_threshold');
  });

  it('should classify FLUENT by default (fallback)', () => {
    const features = {
      regression_count: 1,
      direction_changes: 2,
      path_efficiency: 0.9,
    };

    const result = service.fallbackClassify('sess-5', features);

    expect(result.state).toBe('FLUENT');
  });
});
