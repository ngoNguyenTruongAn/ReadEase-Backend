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
const { StorageService } = require('../storage/storage.service');

class ContentService {
  constructor(contentRepository, segmentationAdapter, storageService) {
    this.contentRepository = contentRepository;
    this.segmentationAdapter = segmentationAdapter;
    this.storageService = storageService;
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
      body_url: content.body_url || null, // New optimal data
      body_segmented_url: content.body_segmented_url || null, // New optimal
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

    const bodyBuffer = Buffer.from(normalizedBody, 'utf-8');
    const segmentedBuffer = Buffer.from(bodySegmented, 'utf-8');

    const bodyUpload = await this.storageService.upload(
      bodyBuffer,
      'body.txt',
      'text/plain',
      'stories',
    );
    const segmentedUpload = await this.storageService.upload(
      segmentedBuffer,
      'segmented.txt',
      'text/plain',
      'stories',
    );

    const created = await this.contentRepository.createContent({
      title: dto.title,
      body_url: bodyUpload.url,
      body_segmented_url: segmentedUpload.url,
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
      const normalizedBody = this.normalizeText(dto.body);
      const bodySegmented = await this.segmentationAdapter.segment(dto.body);

      const bodyBuffer = Buffer.from(normalizedBody, 'utf-8');
      const segmentedBuffer = Buffer.from(bodySegmented, 'utf-8');

      const bodyUpload = await this.storageService.upload(
        bodyBuffer,
        'body.txt',
        'text/plain',
        'stories',
      );
      const segmentedUpload = await this.storageService.upload(
        segmentedBuffer,
        'segmented.txt',
        'text/plain',
        'stories',
      );

      updatePayload.body_url = bodyUpload.url;
      updatePayload.body_segmented_url = segmentedUpload.url;
      updatePayload.word_count = this.calculateWordCount(bodySegmented);
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
Inject(StorageService)(ContentService, undefined, 2);
Injectable()(ContentService);

module.exports = { ContentService };
