const MouseEventStorageService = require('../services/mouse-event-storage.service');

describe('MouseEventStorageService', () => {
  let repository;
  let service;

  beforeEach(() => {
    repository = {
      insert: jest.fn().mockResolvedValue({}),
    };
    service = new MouseEventStorageService(repository);
  });

  it('stores only mouse_move events and computes motor metrics in timestamp order', async () => {
    await service.storeEvents('session-1', [
      { type: 'COGNITIVE_STATE', timestamp: 1000, state: 'FLUENT' },
      { type: 'mouse_move', x: 0, y: 0, timestamp: 1000, wordIndex: 1 },
      { type: 'mouse_move', x: 3, y: 4, timestamp: 1100, word_index: 2 },
      { type: 'mouse_move', x: 3, y: 9, timestamp: 1200, wordIndex: 3 },
    ]);

    expect(repository.insert).toHaveBeenCalledTimes(1);

    const rows = repository.insert.mock.calls[0][0];

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      session_id: 'session-1',
      x: 0,
      y: 0,
      word_index: 1,
      velocity: null,
      acceleration: null,
      curvature: null,
      dwell_time: 0,
    });
    expect(rows[1].velocity).toBeCloseTo(0.05);
    expect(rows[1].acceleration).toBeNull();
    expect(rows[1].curvature).toBeNull();
    expect(rows[2].velocity).toBeCloseTo(0.05);
    expect(rows[2].acceleration).toBeCloseTo(0);
    expect(rows[2].curvature).toBeGreaterThan(0);
  });

  it('keeps previous point state across Redis flushes for the same session', async () => {
    await service.storeEvents('session-1', [{ type: 'mouse_move', x: 10, y: 10, timestamp: 1000 }]);
    await service.storeEvents('session-1', [{ type: 'mouse_move', x: 20, y: 10, timestamp: 1100 }]);

    const secondFlushRows = repository.insert.mock.calls[1][0];

    expect(secondFlushRows[0].velocity).toBeCloseTo(0.1);
  });

  it('clears per-session continuity state when a session ends', async () => {
    await service.storeEvents('session-1', [{ type: 'mouse_move', x: 10, y: 10, timestamp: 1000 }]);

    service.clearSession('session-1');

    await service.storeEvents('session-1', [{ type: 'mouse_move', x: 20, y: 10, timestamp: 1100 }]);

    const secondFlushRows = repository.insert.mock.calls[1][0];

    expect(secondFlushRows[0].velocity).toBeNull();
  });
});
