/**
 * Content Service
 *
 * Manages reading content lifecycle: create, read, update, delete.
 * On create/update, raw body is stored as-is and a segmented version
 * (body_segmented) is generated via the SegmentationAdapter (underthesea).
 */

const { Injectable, Inject, NotFoundException } = require('@nestjs/common');
const { ContentRepository } = require('./content.repository');
const { SegmentationAdapter } = require('./segmentation.adapter');

class ContentService {
  constructor(contentRepository, segmentationAdapter) {
    this.contentRepository = contentRepository;
    this.segmentationAdapter = segmentationAdapter;
  }

  /**
   * Normalize whitespace/newlines for consistent storage.
   */
  normalizeText(text) {
    return this.segmentationAdapter.normalizeText(text);
  }

  calculateWordCount(segmentedBody) {
    if (!segmentedBody || !segmentedBody.trim()) {
      return 0;
    }

    return segmentedBody.trim().split(/\s+/).length;
  }

  /**
   * Full serialization (with body + body_segmented) — for GET /content/:id
   */
  serializeContent(content) {
    return {
      id: content.id,
      title: content.title,
      body: content.body,
      body_segmented: content.body_segmented || null,
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
    const normalizedBody = this.normalizeText(dto.body);
    const bodySegmented = await this.segmentationAdapter.segment(dto.body);

    const created = await this.contentRepository.createContent({
      title: dto.title,
      body: normalizedBody,
      body_segmented: bodySegmented,
      difficulty: dto.difficulty,
      age_group: dto.age_group,
      word_count: this.calculateWordCount(bodySegmented),
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
      updatePayload.body = this.normalizeText(dto.body);
      updatePayload.body_segmented = await this.segmentationAdapter.segment(dto.body);
      updatePayload.word_count = this.calculateWordCount(updatePayload.body_segmented);
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
Inject(SegmentationAdapter)(ContentService, undefined, 1);
Injectable()(ContentService);

module.exports = { ContentService };
