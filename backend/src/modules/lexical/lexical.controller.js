/**
 * Lexical Controller
 *
 * Internal REST endpoint for word simplification.
 * Consumed by the FE directly or by internal services.
 *
 * Endpoints:
 *   POST /api/v1/lexical/simplify
 *
 * Protected by JWT. Accessible by ROLE_CHILD (during reading session).
 * Rate-limit: handled by global ThrottlerGuard.
 */

require('reflect-metadata');

const {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  Inject,
} = require('@nestjs/common');

const { LexicalService } = require('./lexical.service');
const { JwtAuthGuard }   = require('../auth/guards/jwt-auth.guard');

class LexicalController {
  /**
   * @param {LexicalService} lexicalService
   */
  constructor(lexicalService) {
    this.lexicalService = lexicalService;
  }

  /**
   * POST /api/v1/lexical/simplify
   *
   * Body:
   *   {
   *     "word":            "caterpillar",     // required
   *     "contextSentence": "The caterpillar..." // optional
   *   }
   *
   * Response:
   *   {
   *     "original":   "caterpillar",
   *     "simplified": "Đây là một con sâu nhỏ...",
   *     "source":     "gemini" | "cache" | "fallback"
   *   }
   */
  async simplify(body) {
    const word            = body?.word?.toString().trim();
    const contextSentence = body?.contextSentence?.toString().trim() || '';

    if (!word) {
      throw new BadRequestException('"word" is required');
    }
    if (word.length > 100) {
      throw new BadRequestException('"word" must be 100 characters or fewer');
    }

    const result = await this.lexicalService.simplifyWord(word, contextSentence);

    return {
      message: 'Word simplified successfully',
      data:    result,
    };
  }
}

// ── NestJS Decorators ──────────────────────────────────────────────────────

Controller('api/v1/lexical')(LexicalController);
Inject(LexicalService)(LexicalController, undefined, 0);

const simplifyDescriptor = Object.getOwnPropertyDescriptor(
  LexicalController.prototype,
  'simplify',
);

Reflect.decorate(
  [Post('simplify'), UseGuards(JwtAuthGuard)],
  LexicalController.prototype,
  'simplify',
  simplifyDescriptor,
);

Body()(LexicalController.prototype, 'simplify', 0);

module.exports = { LexicalController };
