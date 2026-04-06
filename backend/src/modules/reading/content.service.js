const { Injectable, Inject, NotFoundException } = require('@nestjs/common');
const { ContentRepository } = require('./content.repository');

const VI_COMPOUND_BIGRAMS = new Set([
  'sinh viên',
  'học sinh',
  'giáo viên',
  'công nghệ',
  'đại học',
  'tiểu học',
  'trung học',
  'con chó',
  'con mèo',
  'con cá',
  'con chim',
  'bầu trời',
  'mặt trời',
  'mặt trăng',
  'thành phố',
  'đất nước',
  'gia đình',
]);

const VI_COMPOUND_TRIGRAMS = new Set([]);

const VI_CLASSIFIER_WORDS = new Set([
  'con',
  'cái',
  'chiếc',
  'cây',
  'quyển',
  'cuốn',
  'tờ',
  'bức',
  'viên',
  'miếng',
  'hòn',
  'bộ',
  'đôi',
]);

class ContentService {
  constructor(contentRepository) {
    this.contentRepository = contentRepository;
  }

  normalizeTokenForMatch(token) {
    return String(token || '')
      .toLowerCase()
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
      .trim();
  }

  isWordLike(token) {
    return /[\p{L}\p{N}]/u.test(this.normalizeTokenForMatch(token));
  }

  isInlineWhitespace(token) {
    return /^[ \t]+$/.test(String(token || ''));
  }

  preprocessBodyForStorage(body) {
    const normalizedBody = String(body || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!normalizedBody) {
      return '';
    }

    const tokens = normalizedBody.split(/(\s+)/);
    const mergedTokens = [];

    let index = 0;
    while (index < tokens.length) {
      const token1 = tokens[index] || '';

      if (!token1) {
        index += 1;
        continue;
      }

      if (/^\s+$/.test(token1)) {
        mergedTokens.push(token1);
        index += 1;
        continue;
      }

      const whitespace1 = tokens[index + 1] || '';
      const token2 = tokens[index + 2] || '';
      const whitespace2 = tokens[index + 3] || '';
      const token3 = tokens[index + 4] || '';

      const word1 = this.normalizeTokenForMatch(token1);
      const word2 = this.normalizeTokenForMatch(token2);
      const word3 = this.normalizeTokenForMatch(token3);

      const canCheckPair = word1 && word2 && this.isInlineWhitespace(whitespace1);
      const canCheckTriplet = canCheckPair && word3 && this.isInlineWhitespace(whitespace2);

      const isKnownTrigram =
        canCheckTriplet && VI_COMPOUND_TRIGRAMS.has(`${word1} ${word2} ${word3}`);
      const isKnownBigram = canCheckPair && VI_COMPOUND_BIGRAMS.has(`${word1} ${word2}`);
      const isClassifierPhrase =
        canCheckPair &&
        VI_CLASSIFIER_WORDS.has(word1) &&
        this.isWordLike(token2) &&
        !/[.!?;:]/.test(token2);

      if (isKnownTrigram) {
        mergedTokens.push(`${token1}_${token2}_${token3}`);
        index += 5;
        continue;
      }

      if (isKnownBigram || isClassifierPhrase) {
        mergedTokens.push(`${token1}_${token2}`);
        index += 3;
        continue;
      }

      mergedTokens.push(token1);
      index += 1;
    }

    return mergedTokens.join('').replace(/ +\n/g, '\n').replace(/\n +/g, '\n').trim();
  }

  calculateWordCount(body) {
    if (!body || !body.trim()) {
      return 0;
    }

    return body.trim().split(/\s+/).length;
  }

  /**
   * Full serialization (with body) — for GET /content/:id
   */
  serializeContent(content) {
    return {
      id: content.id,
      title: content.title,
      body: content.body,
      difficulty: content.difficulty,
      age_group: content.age_group,
      word_count: content.word_count,
      cover_image_url: content.cover_image_url || null,
      created_at: content.created_at,
    };
  }

  /**
   * Summary serialization (no body) — for GET /content (list)
   */
  serializeContentSummary(content) {
    return {
      id: content.id,
      title: content.title,
      difficulty: content.difficulty,
      age_group: content.age_group,
      word_count: content.word_count,
      cover_image_url: content.cover_image_url || null,
      created_at: content.created_at,
    };
  }

  async getContent(filters) {
    const [items, total] = await Promise.all([
      this.contentRepository.findPaginated(filters),
      this.contentRepository.count(filters),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / filters.limit);

    return {
      data: items.map((item) => this.serializeContentSummary(item)),
      meta: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages,
      },
    };
  }

  async getContentById(id) {
    const content = await this.contentRepository.findById(id);

    if (!content) {
      throw new NotFoundException('Content not found');
    }

    return this.serializeContent(content);
  }

  async createContent(dto, user) {
    const normalizedBody = this.preprocessBodyForStorage(dto.body);

    const created = await this.contentRepository.createContent({
      title: dto.title,
      body: normalizedBody,
      difficulty: dto.difficulty,
      age_group: dto.age_group,
      word_count: this.calculateWordCount(normalizedBody),
      cover_image_url: dto.cover_image_url || null,
      created_by: user.sub,
    });

    return this.serializeContent(created);
  }

  async updateContent(id, dto) {
    const existing = await this.contentRepository.findById(id);

    if (!existing) {
      throw new NotFoundException('Content not found');
    }

    const updatePayload = { ...dto };

    if (Object.prototype.hasOwnProperty.call(dto, 'body')) {
      updatePayload.body = this.preprocessBodyForStorage(dto.body);
      updatePayload.word_count = this.calculateWordCount(updatePayload.body);
    }

    const updated = await this.contentRepository.updateContent(id, updatePayload);

    if (!updated) {
      throw new NotFoundException('Content not found');
    }

    return this.serializeContent(updated);
  }

  async deleteContent(id) {
    const deleted = await this.contentRepository.softDelete(id);

    if (!deleted) {
      throw new NotFoundException('Content not found');
    }

    return { message: 'Content deleted' };
  }
}

Inject(ContentRepository)(ContentService, undefined, 0);
Injectable()(ContentService);

module.exports = { ContentService };
