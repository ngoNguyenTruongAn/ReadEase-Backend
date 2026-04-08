const { NotFoundException } = require('@nestjs/common');
const { ContentService } = require('../content.service');

describe('ContentService', () => {
  let service;
  let repository;
  let segmentationAdapter;

  beforeEach(() => {
    repository = {
      findPaginated: jest.fn(),
      count: jest.fn(),
      findById: jest.fn(),
      createContent: jest.fn(),
      updateContent: jest.fn(),
      softDelete: jest.fn(),
    };

    segmentationAdapter = {
      segment: jest.fn(),
      normalizeText: jest.fn((text) => {
        if (!text || !text.trim()) return '';
        return String(text)
          .replace(/\r\n?/g, '\n')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }),
    };

    service = new ContentService(repository, segmentationAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────── Create ───────────────────

  it('should create content with raw body and segmented body_segmented', async () => {
    segmentationAdapter.segment.mockResolvedValue('con_bò ăn cỏ');
    repository.createContent.mockResolvedValue({
      id: 'content-1',
      title: 'Sample',
      body: 'con bò ăn cỏ',
      body_segmented: 'con_bò ăn cỏ',
      difficulty: 'EASY',
      age_group: '5-7',
      word_count: 3,
      created_by: 'clinician-1',
      deleted_at: null,
      created_at: new Date('2026-03-15T00:00:00.000Z'),
    });

    const result = await service.createContent(
      {
        title: 'Sample',
        body: 'con bò ăn cỏ',
        difficulty: 'EASY',
        age_group: '5-7',
      },
      { sub: 'clinician-1' },
    );

    expect(segmentationAdapter.segment).toHaveBeenCalledWith('con bò ăn cỏ');
    expect(repository.createContent).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'con bò ăn cỏ',
        body_segmented: 'con_bò ăn cỏ',
        word_count: 3,
      }),
    );
    expect(result).not.toHaveProperty('created_by');
    expect(result).not.toHaveProperty('deleted_at');
    expect(result.body).toBe('con bò ăn cỏ');
    expect(result.body_segmented).toBe('con_bò ăn cỏ');
  });

  it('should store normalized body and segmented version separately', async () => {
    segmentationAdapter.segment.mockResolvedValue('con_bò ăn cỏ\n\ncon_chim bay');
    repository.createContent.mockResolvedValue({
      id: 'content-2',
      title: 'Spacing test',
      body: 'con bò ăn cỏ\n\ncon chim bay',
      body_segmented: 'con_bò ăn cỏ\n\ncon_chim bay',
      difficulty: 'EASY',
      age_group: '5-7',
      word_count: 5,
      created_at: new Date('2026-03-15T00:00:00.000Z'),
    });

    await service.createContent(
      {
        title: 'Spacing test',
        body: '  con   bò   ăn   cỏ\n\n\ncon  chim bay  ',
        difficulty: 'EASY',
        age_group: '5-7',
      },
      { sub: 'clinician-1' },
    );

    expect(repository.createContent).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'con bò ăn cỏ\n\ncon chim bay',
        body_segmented: 'con_bò ăn cỏ\n\ncon_chim bay',
        word_count: 5,
      }),
    );
  });

  it('should fallback gracefully when segmentation fails', async () => {
    // Adapter returns normalized text as fallback
    segmentationAdapter.segment.mockResolvedValue('con bò ăn cỏ');
    repository.createContent.mockResolvedValue({
      id: 'content-fallback',
      title: 'Fallback',
      body: 'con bò ăn cỏ',
      body_segmented: 'con bò ăn cỏ',
      difficulty: 'EASY',
      age_group: '5-7',
      word_count: 4,
      created_at: new Date('2026-03-15T00:00:00.000Z'),
    });

    const result = await service.createContent(
      {
        title: 'Fallback',
        body: 'con bò ăn cỏ',
        difficulty: 'EASY',
        age_group: '5-7',
      },
      { sub: 'clinician-1' },
    );

    // Even on fallback, create should succeed
    expect(result.id).toBe('content-fallback');
    expect(result.body_segmented).toBe('con bò ăn cỏ');
  });

  // ─────────────────── Update ───────────────────

  it('should update body_segmented when body changes', async () => {
    repository.findById.mockResolvedValue({
      id: 'content-2',
      title: 'Old title',
      body: 'Old body text that is long enough for the minimum validation constraint.',
    });
    segmentationAdapter.segment.mockResolvedValue('con_mèo chạy nhanh qua sân nhà trong chiều mưa nhẹ.');
    repository.updateContent.mockResolvedValue({
      id: 'content-2',
      title: 'New title',
      body: 'con mèo chạy nhanh qua sân nhà trong chiều mưa nhẹ.',
      body_segmented: 'con_mèo chạy nhanh qua sân nhà trong chiều mưa nhẹ.',
      difficulty: 'MEDIUM',
      age_group: '8-10',
      word_count: 10,
      created_at: new Date('2026-03-15T00:00:00.000Z'),
    });

    const result = await service.updateContent('content-2', {
      title: 'New title',
      body: 'con mèo chạy nhanh qua sân nhà trong chiều mưa nhẹ.',
      difficulty: 'MEDIUM',
      age_group: '8-10',
    });

    expect(segmentationAdapter.segment).toHaveBeenCalledWith(
      'con mèo chạy nhanh qua sân nhà trong chiều mưa nhẹ.',
    );
    expect(repository.updateContent).toHaveBeenCalledWith(
      'content-2',
      expect.objectContaining({
        body_segmented: 'con_mèo chạy nhanh qua sân nhà trong chiều mưa nhẹ.',
      }),
    );
    expect(result.word_count).toBe(10);
  });

  it('should not re-segment when body is not updated', async () => {
    repository.findById.mockResolvedValue({
      id: 'content-3',
      title: 'Old title',
      body: 'Some body',
    });
    repository.updateContent.mockResolvedValue({
      id: 'content-3',
      title: 'Updated title',
      body: 'Some body',
      body_segmented: 'Some body',
      difficulty: 'EASY',
      age_group: '5-7',
      word_count: 2,
      created_at: new Date('2026-03-15T00:00:00.000Z'),
    });

    await service.updateContent('content-3', { title: 'Updated title' });

    expect(segmentationAdapter.segment).not.toHaveBeenCalled();
  });

  // ─────────────────── Read ───────────────────

  it('should include body_segmented in content detail', async () => {
    repository.findById.mockResolvedValue({
      id: 'content-42',
      title: 'Chi tiet',
      body: 'con bò ăn cỏ',
      body_segmented: 'con_bò ăn cỏ',
      difficulty: 'EASY',
      age_group: '5-7',
      word_count: 3,
      cover_image_url: null,
      created_at: new Date('2026-03-15T00:00:00.000Z'),
    });

    const result = await service.getContentById('content-42');

    expect(result.body).toBe('con bò ăn cỏ');
    expect(result.body_segmented).toBe('con_bò ăn cỏ');
  });

  it('should return paginated content without body fields', async () => {
    repository.findPaginated.mockResolvedValue([
      {
        id: 'a',
        title: 'A',
        body: 'Body A',
        body_segmented: 'Body A',
        difficulty: 'EASY',
        age_group: '5-7',
        word_count: 2,
        created_by: 'x',
        deleted_at: null,
        created_at: new Date('2026-03-15T00:00:00.000Z'),
      },
    ]);
    repository.count.mockResolvedValue(12);

    const result = await service.getContent({
      page: 2,
      limit: 5,
      difficulty: 'EASY',
      age_group: '5-7',
    });

    expect(result.meta).toEqual({
      page: 2,
      limit: 5,
      total: 12,
      totalPages: 3,
    });
    expect(result.data[0]).not.toHaveProperty('created_by');
    expect(result.data[0]).not.toHaveProperty('deleted_at');
    expect(result.data[0]).not.toHaveProperty('body');
    expect(result.data[0]).not.toHaveProperty('body_segmented');
  });

  // ─────────────────── Delete ───────────────────

  it('should soft delete content', async () => {
    repository.softDelete.mockResolvedValue(true);

    const result = await service.deleteContent('content-3');

    expect(repository.softDelete).toHaveBeenCalledWith('content-3');
    expect(result).toEqual({ message: 'Content deleted' });
  });

  // ─────────────────── Error cases ───────────────────

  it('should throw NotFoundException when updating missing content', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.updateContent('missing-id', { title: 'New title' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw NotFoundException when content detail is missing', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.getContentById('missing-id')).rejects.toThrow(NotFoundException);
  });

  // ─────────────────── Edge cases ───────────────────

  it('should handle empty body on create', async () => {
    segmentationAdapter.segment.mockResolvedValue('');
    repository.createContent.mockResolvedValue({
      id: 'content-empty',
      title: 'Empty',
      body: '',
      body_segmented: '',
      difficulty: 'EASY',
      age_group: '5-7',
      word_count: 0,
      created_at: new Date('2026-03-15T00:00:00.000Z'),
    });

    const result = await service.createContent(
      {
        title: 'Empty',
        body: '',
        difficulty: 'EASY',
        age_group: '5-7',
      },
      { sub: 'clinician-1' },
    );

    expect(result.word_count).toBe(0);
  });
});
