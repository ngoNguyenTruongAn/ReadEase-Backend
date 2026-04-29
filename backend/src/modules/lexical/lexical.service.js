/**
 * LexicalService — Gemini-powered word simplification
 *
 * Implements real-time semantic intervention: given a difficult word and
 * its surrounding sentence context, generates a simple, child-friendly
 * explanation via the Gemini API.
 *
 * Architecture:
 *   1. Check Redis cache  →  key: `lexical:{word}`, TTL 24h
 *   2. On cache miss      →  call Gemini with a "7-year-old" prompt
 *   3. Store in Redis     →  return { simplified, original, source }
 *   4. On Gemini failure  →  return graceful fallback (original word)
 *
 * Redis key schema:
 *   lexical:{word}   →  JSON string, TTL = LEXICAL_CACHE_TTL_SECONDS (default 86400)
 */

const { Injectable, Inject } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { logger } = require('../../common/logger/winston.config');

const CACHE_TTL_SECONDS = parseInt(process.env.LEXICAL_CACHE_TTL_SECONDS || '86400', 10); // 24h
const GEMINI_TIMEOUT_MS = parseInt(process.env.LEXICAL_GEMINI_TIMEOUT_MS || '5000', 10); // 5s

class LexicalService {
  /**
   * @param {import('ioredis').Redis} redisClient
   * @param {import('@nestjs/config').ConfigService} configService
   */
  constructor(redisClient, configService) {
    this.redis = redisClient;
    this.configService = configService;
    this.geminiClient = null;
    this.modelName = '';

    this._initGemini();
  }

  // ── Private: init Gemini SDK ──────────────────────────────────────────────

  _initGemini() {
    const apiKey = this.configService.get('gemini.apiKey');
    this.modelName = this.configService.get('gemini.model') || 'gemini-2.0-flash';

    if (apiKey) {
      this.geminiClient = new GoogleGenerativeAI(apiKey);
      logger.info('LexicalService: Gemini client initialised', {
        context: 'LexicalService',
        data: { model: this.modelName },
      });
    } else {
      logger.warn('LexicalService: GEMINI_API_KEY not set — will use fallback simplification', {
        context: 'LexicalService',
      });
    }
  }

  // ── Cache key helper ──────────────────────────────────────────────────────

  _cacheKey(word) {
    // Normalise: lowercase + trim to avoid key fragmentation
    return `lexical:${word.toLowerCase().trim()}`;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Simplify a word for a 7-year-old child.
   *
   * @param {string} word             - The difficult word to simplify
   * @param {string} contextSentence  - The sentence in which the word appears
   * @returns {Promise<{
   *   original:   string,
   *   simplified: string,
   *   source:     'cache' | 'gemini' | 'fallback'
   * }>}
   */
  async simplifyWord(word, contextSentence = '') {
    if (!word || typeof word !== 'string') {
      return this._fallbackResult(word);
    }

    const normalised = word.trim();
    const key = this._cacheKey(normalised);

    // ── 1. Redis cache lookup ──
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        logger.info('Lexical cache hit', {
          context: 'LexicalService',
          data: { word: normalised, key },
        });
        return { original: normalised, simplified: parsed.simplified, source: 'cache' };
      }
    } catch (cacheErr) {
      // Non-fatal — proceed to Gemini
      logger.warn('Lexical Redis read error', {
        context: 'LexicalService',
        data: { word: normalised, error: cacheErr.message },
      });
    }

    // ── 2. Gemini API call ──
    if (this.geminiClient) {
      try {
        const prompt = this._buildPrompt(normalised, contextSentence);
        const model = this.geminiClient.getGenerativeModel({ model: this.modelName });

        const result = await Promise.race([
          model.generateContent(prompt),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('LexicalService: Gemini timeout')),
              GEMINI_TIMEOUT_MS,
            ),
          ),
        ]);

        const simplified = result.response.text().trim();

        if (!simplified || simplified.length < 2) {
          throw new Error('Gemini returned empty simplification');
        }

        // ── 3. Store in Redis cache ──
        try {
          await this.redis.set(key, JSON.stringify({ simplified }), 'EX', CACHE_TTL_SECONDS);
        } catch (cacheWriteErr) {
          logger.warn('Lexical Redis write error (non-fatal)', {
            context: 'LexicalService',
            data: { word: normalised, error: cacheWriteErr.message },
          });
        }

        logger.info('Lexical simplification via Gemini', {
          context: 'LexicalService',
          data: { word: normalised, simplified, model: this.modelName },
        });

        return { original: normalised, simplified, source: 'gemini' };
      } catch (geminiErr) {
        const isQuota = geminiErr.message?.includes('429') || geminiErr.message?.includes('quota');

        if (isQuota) {
          logger.warn('LexicalService: Gemini quota exceeded — using fallback', {
            context: 'LexicalService',
            data: { word: normalised, error: geminiErr.message },
          });
        } else {
          logger.error('LexicalService: Gemini call failed — using fallback', {
            context: 'LexicalService',
            data: { word: normalised, error: geminiErr.message },
          });
        }
      }
    }

    // ── 4. Graceful fallback ──
    return this._fallbackResult(normalised);
  }

  // ── Private: prompt engineering ───────────────────────────────────────────

  /**
   * Build a concise Gemini prompt targeting a 7-year-old reading level.
   * Instructs the model to return ONLY the simplified explanation, no extra text.
   */
  _buildPrompt(word, contextSentence) {
    const contextPart = contextSentence
      ? `The word appears in this sentence: "${contextSentence}"`
      : '';

    return `You are a reading assistant for children with Dyslexia aged 6-8.
A child is reading and encountered the word: "${word}".
${contextPart}

Your task: Explain what "${word}" means using the SIMPLEST possible words a 7-year-old Vietnamese child would understand.
Rules:
- Write in Vietnamese.
- Use 1-2 short sentences maximum.
- Use everyday words a child already knows.
- Do NOT repeat the original word at the start.
- Do NOT include any introduction or preamble — output ONLY the explanation.

Explanation:`.trim();
  }

  // ── Private: fallback result ──────────────────────────────────────────────

  _fallbackResult(word) {
    logger.info('LexicalService: fallback result', {
      context: 'LexicalService',
      data: { word },
    });
    // Return the original word — FE tooltip will display it as-is
    return {
      original: word || '',
      simplified: word || '',
      source: 'fallback',
    };
  }
}

// ── NestJS DI decorators ──────────────────────────────────────────────────────
Injectable()(LexicalService);
Inject('REDIS_LEXICAL_CLIENT')(LexicalService, undefined, 0);
Inject(ConfigService)(LexicalService, undefined, 1);

module.exports = { LexicalService };
