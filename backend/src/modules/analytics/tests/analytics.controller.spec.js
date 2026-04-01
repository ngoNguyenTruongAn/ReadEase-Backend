require('reflect-metadata');

const { BadRequestException } = require('@nestjs/common');
const { AnalyticsController } = require('../analytics.controller');
const { SessionsController } = require('../sessions.controller');

describe('AnalyticsController', () => {
  let controller;
  let mockService;

  beforeEach(() => {
    mockService = {
      getHeatmap: jest.fn(),
      getTrends: jest.fn(),
    };

    controller = new AnalyticsController(mockService);
  });

  // ── Route guard metadata ──

  it('should have ROLE_CLINICIAN guard on getHeatmap', () => {
    const roles = Reflect.getMetadata('roles', AnalyticsController.prototype.getHeatmap);
    expect(roles).toEqual(['ROLE_CLINICIAN']);
  });

  it('should have ROLE_CLINICIAN guard on getTrends', () => {
    const roles = Reflect.getMetadata('roles', AnalyticsController.prototype.getTrends);
    expect(roles).toEqual(['ROLE_CLINICIAN']);
  });

  // ── Validation ──

  it('should reject invalid childId on getTrends', async () => {
    await expect(controller.getTrends('not-a-uuid', {})).rejects.toThrow(BadRequestException);
  });

  it('should reject invalid days param on getTrends', async () => {
    await expect(
      controller.getTrends('11111111-1111-4111-8111-111111111111', { days: 200 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should call service with default days=7 when not provided', async () => {
    mockService.getTrends.mockResolvedValueOnce({ daily: [] });

    await controller.getTrends('11111111-1111-4111-8111-111111111111', {});

    expect(mockService.getTrends).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 7);
  });
});

describe('SessionsController', () => {
  let controller;
  let mockService;

  beforeEach(() => {
    mockService = {
      getSessionReplay: jest.fn(),
      getChildSessions: jest.fn(),
    };

    controller = new SessionsController(mockService);
  });

  // ── Route guard metadata ──

  it('should have ROLE_CLINICIAN guard on getReplay', () => {
    const roles = Reflect.getMetadata('roles', SessionsController.prototype.getReplay);
    expect(roles).toEqual(['ROLE_CLINICIAN']);
  });

  it('should have ROLE_CLINICIAN guard on getChildSessions', () => {
    const roles = Reflect.getMetadata('roles', SessionsController.prototype.getChildSessions);
    expect(roles).toEqual(['ROLE_CLINICIAN']);
  });

  // ── Validation ──

  it('should reject invalid sessionId on getReplay', async () => {
    await expect(controller.getReplay('not-a-uuid')).rejects.toThrow(BadRequestException);
  });

  it('should reject invalid childId on getChildSessions', async () => {
    await expect(controller.getChildSessions('bad-id', {})).rejects.toThrow(BadRequestException);
  });

  it('should reject negative limit on getChildSessions', async () => {
    await expect(
      controller.getChildSessions('11111111-1111-4111-8111-111111111111', { limit: -5 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject invalid status on getChildSessions', async () => {
    await expect(
      controller.getChildSessions('11111111-1111-4111-8111-111111111111', {
        status: 'INVALID_STATUS',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ── Happy path ──

  it('should call service with validated params for getReplay', async () => {
    mockService.getSessionReplay.mockResolvedValueOnce({ events: [] });

    await controller.getReplay('11111111-1111-4111-8111-111111111111');

    expect(mockService.getSessionReplay).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('should call service with defaults for getChildSessions', async () => {
    mockService.getChildSessions.mockResolvedValueOnce({ data: [], meta: {} });

    await controller.getChildSessions('11111111-1111-4111-8111-111111111111', {});

    expect(mockService.getChildSessions).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      20,
      0,
      undefined,
    );
  });
});
