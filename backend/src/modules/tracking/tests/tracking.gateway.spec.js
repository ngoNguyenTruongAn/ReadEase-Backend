require('reflect-metadata');

jest.mock('../../lexical/lexical.service', () => ({
  LexicalService: class LexicalService {},
}));

const TrackingGateway = require('../tracking.gateway');

function makeGateway() {
  const trajectoryBuffer = {
    push: jest.fn().mockResolvedValue(undefined),
    flushSession: jest.fn().mockResolvedValue(undefined),
  };
  const sessionService = {
    ensureSession: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn().mockResolvedValue({ effort_score: 0 }),
  };
  const replayStorage = {
    storeEvents: jest.fn().mockResolvedValue(undefined),
  };
  const mlClient = {
    classify: jest.fn(),
  };
  const tokenService = {
    earnFromSession: jest.fn().mockResolvedValue(undefined),
  };

  const gateway = new TrackingGateway(
    trajectoryBuffer,
    sessionService,
    replayStorage,
    mlClient,
    {},
    tokenService,
    null,
  );

  return {
    gateway,
    trajectoryBuffer,
    sessionService,
    replayStorage,
    mlClient,
    tokenService,
  };
}

function makeClient() {
  return {
    session_id: 'sess-1',
    user_id: 'user-1',
    readyState: 1,
    send: jest.fn(),
  };
}

function makePoints(startIndex, count, startTimestamp = 1000) {
  return Array.from({ length: count }, (_, offset) => {
    const index = startIndex + offset;

    return {
      x: 100 + index * 20,
      y: 200,
      timestamp: startTimestamp + index * 100,
      wordIndex: index,
      word_index: index,
    };
  });
}

describe('TrackingGateway rolling classifier window', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('aggregates small mouse:batch chunks before classifying', async () => {
    const { gateway, trajectoryBuffer } = makeGateway();
    const client = makeClient();
    const classifySpy = jest.spyOn(gateway, 'classifyAndRoute').mockResolvedValue(undefined);

    gateway.rollingWindowMinPoints = 5;
    gateway.rollingWindowMaxPoints = 40;
    gateway.rollingWindowMs = 2500;

    await gateway.handleMouseBatch(client, { data: { points: makePoints(0, 3) } });

    expect(trajectoryBuffer.push).toHaveBeenCalledWith('sess-1', 'user-1', makePoints(0, 3));
    expect(classifySpy).not.toHaveBeenCalled();

    await gateway.handleMouseBatch(client, { data: { points: makePoints(3, 3) } });

    expect(classifySpy).toHaveBeenCalledTimes(1);
    expect(classifySpy.mock.calls[0][1]).toHaveLength(6);
    expect(classifySpy.mock.calls[0][1][5].wordIndex).toBe(5);
  });

  it('trims the rolling window by point count', async () => {
    const { gateway } = makeGateway();
    const client = makeClient();
    const classifySpy = jest.spyOn(gateway, 'classifyAndRoute').mockResolvedValue(undefined);

    gateway.rollingWindowMinPoints = 3;
    gateway.rollingWindowMaxPoints = 5;
    gateway.rollingWindowMs = 10000;

    await gateway.handleMouseBatch(client, { data: { points: makePoints(0, 3) } });
    await gateway.handleMouseBatch(client, { data: { points: makePoints(3, 3) } });

    const latestWindow = classifySpy.mock.calls[1][1];
    expect(latestWindow).toHaveLength(5);
    expect(latestWindow[0].wordIndex).toBe(1);
    expect(latestWindow[4].wordIndex).toBe(5);
  });

  it('trims the rolling window by recent timestamp', async () => {
    const { gateway } = makeGateway();
    const client = makeClient();
    const classifySpy = jest.spyOn(gateway, 'classifyAndRoute').mockResolvedValue(undefined);

    gateway.rollingWindowMinPoints = 3;
    gateway.rollingWindowMaxPoints = 40;
    gateway.rollingWindowMs = 1000;

    await gateway.handleMouseBatch(client, { data: { points: makePoints(0, 3, 1000) } });
    await gateway.handleMouseBatch(client, { data: { points: makePoints(0, 3, 5000) } });

    const latestWindow = classifySpy.mock.calls[1][1];
    expect(latestWindow).toHaveLength(3);
    expect(latestWindow[0].timestamp).toBe(5000);
    expect(latestWindow[2].timestamp).toBe(5200);
  });

  it('suppresses repeated same-state interventions during cooldown', async () => {
    const { gateway, mlClient, replayStorage } = makeGateway();
    const client = makeClient();
    const points = makePoints(0, 20);

    gateway.interventionCooldownMs = 100000;
    mlClient.classify.mockResolvedValue({
      state: 'REGRESSION',
      confidence: 0.9,
      session_id: 'sess-1',
      source: 'ml_model',
    });

    await gateway.classifyAndRoute(client, points);

    const sentMessages = client.send.mock.calls.map(([message]) => JSON.parse(message));
    const trigger = sentMessages.find((message) => message.event === 'adaptation:trigger');
    expect(trigger.data.wordIndex).toBe(19);
    expect(client.send).toHaveBeenCalledTimes(2);
    expect(replayStorage.storeEvents.mock.calls[0][1][0].interventionType).toBe('DUAL');

    await gateway.classifyAndRoute(client, points);

    expect(client.send).toHaveBeenCalledTimes(2);
    expect(replayStorage.storeEvents.mock.calls[1][1][0].interventionType).toBe('SUPPRESSED');
  });
});
