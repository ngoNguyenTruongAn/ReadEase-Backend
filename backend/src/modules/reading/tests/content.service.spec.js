const { NotFoundException } = require('@nestjs/common');
const { ContentService } = require('../content.service');

describe('ContentService', () => {
  let service;
  let repository;
  let segmentationAdapter;
  let storageService;

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

    storageService = {
      upload: jest
        .fn()
        .mockResolvedValue({ url: 'https://storage.test/mock.txt', key: 'mock_key' }),
    };

    service = new ContentService(repository, segmentationAdapter, storageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────── Create ───────────────────

  it('should create content and upload body to Supabase Storage', async () => {
    segmentationAdapter.segment.mockResolvedValue('con_bò ăn cỏ');
    repository.createContent.mockResolvedValue({
      id: 'content-1',
      title: 'Sample',
      body_url: 'https://storage.test/mock.txt',
      body_segmented_url: 'https://storage.test/mock.txt',
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
    expect(storageService.upload).toHaveBeenCalledTimes(2);
    expect(repository.createContent).toHaveBeenCalledWith(
      expect.objectContaining({
        body_url: 'https://storage.test/mock.txt',
        body_segmented_url: 'https://storage.test/mock.txt',
        word_count: 3,
      }),
    );
    expect(result).not.toHaveProperty('created_by');
    expect(result).not.toHaveProperty('deleted_at');
    expect(result.body_url).toBe('https://storage.test/mock.txt');
    expect(result.body_segmented_url).toBe('https://storage.test/mock.txt');
  });

  it('should upload normalized body and segmented version separately', async () => {
    segmentationAdapter.segment.mockResolvedValue('con_bò ăn cỏ\n\ncon_chim bay');
    repository.createContent.mockResolvedValue({
      id: 'content-2',
      title: 'Spacing test',
      body_url: 'https://storage.test/mock.txt',
      body_segmented_url: 'https://storage.test/mock.txt',
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

    // Storage upload should be called with normalized body buffer
    expect(storageService.upload).toHaveBeenCalledTimes(2);
    expect(repository.createContent).toHaveBeenCalledWith(
      expect.objectContaining({
        body_url: 'https://storage.test/mock.txt',
        body_segmented_url: 'https://storage.test/mock.txt',
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
      body_url: 'https://storage.test/mock.txt',
      body_segmented_url: 'https://storage.test/mock.txt',
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

    // Even on fallback, create should succeed with URLs
    expect(result.id).toBe('content-fallback');
    expect(result.body_segmented_url).toBe('https://storage.test/mock.txt');
  });

  // ─────────────────── Update ───────────────────

  it('should re-upload to storage when body changes on update', async () => {
    repository.findById.mockResolvedValue({
      id: 'content-2',
      title: 'Old title',
      body_url: 'https://storage.test/old.txt',
    });
    segmentationAdapter.segment.mockResolvedValue(
      'con_mèo chạy nhanh qua sân nhà trong chiều mưa nhẹ.',
    );
    repository.updateContent.mockResolvedValue({
      id: 'content-2',
      title: 'New title',
      body_url: 'https://storage.test/mock.txt',
      body_segmented_url: 'https://storage.test/mock.txt',
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
    expect(storageService.upload).toHaveBeenCalledTimes(2);
    expect(repository.updateContent).toHaveBeenCalledWith(
      'content-2',
      expect.objectContaining({
        body_url: 'https://storage.test/mock.txt',
        body_segmented_url: 'https://storage.test/mock.txt',
      }),
    );
    expect(result.word_count).toBe(10);
  });

  it('should not re-segment when body is not updated', async () => {
    repository.findById.mockResolvedValue({
      id: 'content-3',
      title: 'Old title',
      body_url: 'https://storage.test/old.txt',
    });
    repository.updateContent.mockResolvedValue({
      id: 'content-3',
      title: 'Updated title',
      body_url: 'https://storage.test/old.txt',
      body_segmented_url: 'https://storage.test/old-seg.txt',
      difficulty: 'EASY',
      age_group: '5-7',
      word_count: 2,
      created_at: new Date('2026-03-15T00:00:00.000Z'),
    });

    await service.updateContent('content-3', { title: 'Updated title' });

    expect(segmentationAdapter.segment).not.toHaveBeenCalled();
    expect(storageService.upload).not.toHaveBeenCalled();
  });

  // ─────────────────── Read ───────────────────

  it('should include body_url and body_segmented_url in content detail', async () => {
    repository.findById.mockResolvedValue({
      id: 'content-42',
      title: 'Chi tiet',
      body_url: 'https://storage.test/body.txt',
      body_segmented_url: 'https://storage.test/seg.txt',
      difficulty: 'EASY',
      age_group: '5-7',
      word_count: 3,
      cover_image_url: null,
      created_at: new Date('2026-03-15T00:00:00.000Z'),
    });

    const result = await service.getContentById('content-42');

    expect(result.body_url).toBe('https://storage.test/body.txt');
    expect(result.body_segmented_url).toBe('https://storage.test/seg.txt');
  });

  it('should return paginated content without body fields', async () => {
    repository.findPaginated.mockResolvedValue([
      {
        id: 'a',
        title: 'A',
        body_url: 'https://storage.test/a.txt',
        body_segmented_url: 'https://storage.test/a-seg.txt',
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
      body_url: 'https://storage.test/mock.txt',
      body_segmented_url: 'https://storage.test/mock.txt',
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
