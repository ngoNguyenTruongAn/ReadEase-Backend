/**
 * LexicalService Unit Tests
 *
 * Test cases:
 *   1. Cache hit  — returns cached value, does NOT call Gemini
 *   2. Cache miss + Gemini success — calls Gemini, stores in cache, returns result
 *   3. Cache miss + Gemini failure — returns fallback (original word)
 *   4. Cache miss + no Gemini client — returns fallback immediately
 *   5. Empty word input — returns fallback without calling Redis or Gemini
 *   6. Word > 100 chars — handled by controller (not tested here)
 *   7. Cache read error (non-fatal) — proceeds to Gemini
 *   8. Cache write error (non-fatal) — still returns Gemini result
 *
 * Mocking strategy:
 *   - Redis: manual mock object with jest.fn()
 *   - Gemini SDK: manual mock via jest.spyOn on GoogleGenerativeAI
 *   - ConfigService: simple stub
 */

const { LexicalService } = require('../lexical.service');

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRedisMock(overrides = {}) {
  return {
    get:    jest.fn().mockResolvedValue(null),
    set:    jest.fn().mockResolvedValue('OK'),
    ...overrides,
  };
}

function makeConfigMock(apiKey = 'fake-api-key') {
  return {
    get: jest.fn((key) => {
      if (key === 'gemini.apiKey') return apiKey;
      if (key === 'gemini.model')  return 'gemini-2.0-flash';
      return null;
    }),
  };
}

function makeGeminiMock(text = 'Đây là con sâu nhỏ.') {
  return {
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => text },
      }),
    }),
  };
}

// ── Inject mocks into LexicalService ────────────────────────────────────────

function buildService(redisMock, configMock, geminiClientOverride) {
  const svc = new LexicalService(redisMock, configMock);
  if (geminiClientOverride !== undefined) {
    svc.geminiClient = geminiClientOverride;
  }
  return svc;
}

// ════════════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════════════

describe('LexicalService', () => {
  // ── Test 1: Cache hit ────────────────────────────────────────────────────
  it('should return cached result without calling Gemini', async () => {
    const redisMock  = makeRedisMock({
      get: jest.fn().mockResolvedValue(JSON.stringify({ simplified: 'Đây là từ được lưu.' })),
    });
    const configMock = makeConfigMock();
    const geminiMock = makeGeminiMock();
    const svc        = buildService(redisMock, configMock, geminiMock);

    const result = await svc.simplifyWord('caterpillar', 'The caterpillar crawled.');

    expect(result.source).toBe('cache');
    expect(result.simplified).toBe('Đây là từ được lưu.');
    expect(result.original).toBe('caterpillar');
    expect(geminiMock.getGenerativeModel).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  // ── Test 2: Cache miss + Gemini success ───────────────────────────────────
  it('should call Gemini on cache miss and store result in cache', async () => {
    const redisMock  = makeRedisMock();
    const configMock = makeConfigMock();
    const geminiMock = makeGeminiMock('Con sâu là sinh vật nhỏ bé sống trong vườn.');
    const svc        = buildService(redisMock, configMock, geminiMock);

    const result = await svc.simplifyWord('caterpillar', '');

    expect(result.source).toBe('gemini');
    expect(result.simplified).toBe('Con sâu là sinh vật nhỏ bé sống trong vườn.');
    expect(result.original).toBe('caterpillar');

    // Should have checked cache first
    expect(redisMock.get).toHaveBeenCalledWith('lexical:caterpillar');

    // Should have stored result in cache
    expect(redisMock.set).toHaveBeenCalledWith(
      'lexical:caterpillar',
      JSON.stringify({ simplified: 'Con sâu là sinh vật nhỏ bé sống trong vườn.' }),
      'EX',
      86400,
    );
  });

  // ── Test 3: Cache miss + Gemini failure → fallback ────────────────────────
  it('should return fallback when Gemini throws an error', async () => {
    const redisMock  = makeRedisMock();
    const configMock = makeConfigMock();
    const failingGemini = {
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn().mockRejectedValue(new Error('Network error')),
      }),
    };
    const svc = buildService(redisMock, configMock, failingGemini);

    const result = await svc.simplifyWord('magnificent');

    expect(result.source).toBe('fallback');
    expect(result.original).toBe('magnificent');
    expect(result.simplified).toBe('magnificent');
  });

  // ── Test 4: No Gemini client (no API key) → fallback ────────────────────
  it('should return fallback immediately when Gemini client is not configured', async () => {
    const redisMock  = makeRedisMock();
    const configMock = makeConfigMock(null); // no API key
    const svc        = buildService(redisMock, configMock, null);

    const result = await svc.simplifyWord('luminous', 'The luminous moon...');

    expect(result.source).toBe('fallback');
    expect(result.original).toBe('luminous');
  });

  // ── Test 5: Empty word ────────────────────────────────────────────────────
  it('should return fallback for empty word without calling Redis', async () => {
    const redisMock  = makeRedisMock();
    const configMock = makeConfigMock();
    const svc        = buildService(redisMock, configMock, makeGeminiMock());

    const result = await svc.simplifyWord('');

    expect(result.source).toBe('fallback');
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  // ── Test 6: Cache read error (non-fatal) — proceeds to Gemini ───────────
  it('should proceed to Gemini when Redis read throws an error', async () => {
    const redisMock = makeRedisMock({
      get: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
    });
    const configMock = makeConfigMock();
    const geminiMock = makeGeminiMock('Đây là ánh sáng rực rỡ.');
    const svc        = buildService(redisMock, configMock, geminiMock);

    const result = await svc.simplifyWord('radiant');

    expect(result.source).toBe('gemini');
    expect(result.simplified).toBe('Đây là ánh sáng rực rỡ.');
  });

  // ── Test 7: Cache write error (non-fatal) — still returns Gemini result ──
  it('should still return Gemini result when Redis write fails', async () => {
    const redisMock = makeRedisMock({
      set: jest.fn().mockRejectedValue(new Error('Redis write error')),
    });
    const configMock = makeConfigMock();
    const geminiMock = makeGeminiMock('Đây là loài chim bay trên trời.');
    const svc        = buildService(redisMock, configMock, geminiMock);

    const result = await svc.simplifyWord('pelican', 'A pelican soared.');

    expect(result.source).toBe('gemini');
    expect(result.simplified).toBe('Đây là loài chim bay trên trời.');
  });

  // ── Test 8: Response format validation ───────────────────────────────────
  it('should normalise word (trim + lowercase) for cache key', async () => {
    const redisMock  = makeRedisMock();
    const configMock = makeConfigMock();
    const geminiMock = makeGeminiMock('Đây là từ đơn giản.');
    const svc        = buildService(redisMock, configMock, geminiMock);

    await svc.simplifyWord('  HELLO  ');

    expect(redisMock.get).toHaveBeenCalledWith('lexical:hello');
    expect(redisMock.set).toHaveBeenCalledWith(
      'lexical:hello',
      expect.any(String),
      'EX',
      86400,
    );
  });

  // ── Test 9: Gemini quota error (429) → fallback ───────────────────────────
  it('should return fallback when Gemini returns 429 quota error', async () => {
    const redisMock  = makeRedisMock();
    const configMock = makeConfigMock();
    const quotaGemini = {
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest
          .fn()
          .mockRejectedValue(new Error('Request failed with status 429: quota exceeded')),
      }),
    };
    const svc = buildService(redisMock, configMock, quotaGemini);

    const result = await svc.simplifyWord('ephemeral');

    expect(result.source).toBe('fallback');
  });

  // ── Test 10: _cacheKey normalisation ─────────────────────────────────────
  it('_cacheKey should return lowercased trimmed key', () => {
    const svc = buildService(makeRedisMock(), makeConfigMock(), null);
    expect(svc._cacheKey('  HELLO World ')).toBe('lexical:hello world');
    expect(svc._cacheKey('butterfly')).toBe('lexical:butterfly');
  });
});
