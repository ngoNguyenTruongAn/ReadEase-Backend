const { NotFoundException } = require('@nestjs/common');
const { ContentService } = require('../content.service');

describe('ContentService', () => {
  let service;
  let repository;

  beforeEach(() => {
    repository = {
      findPaginated: jest.fn(),
      count: jest.fn(),
      findById: jest.fn(),
      createContent: jest.fn(),
      updateContent: jest.fn(),
      softDelete: jest.fn(),
    };

    service = new ContentService(repository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create content with calculated word_count and hide sensitive fields', async () => {
    repository.createContent.mockResolvedValue({
      id: 'content-1',
      title: 'Sample',
      body: 'Con_bò đang gặm cỏ xanh ngoài đồng vào buổi sáng sớm.',
      difficulty: 'EASY',
      age_group: '5-7',
      word_count: 11,
      created_by: 'clinician-1',
      deleted_at: null,
      created_at: new Date('2026-03-15T00:00:00.000Z'),
    });

    const result = await service.createContent(
      {
        title: 'Sample',
        body: 'Con bò đang gặm cỏ xanh ngoài đồng vào buổi sáng sớm.',
        difficulty: 'EASY',
        age_group: '5-7',
      },
      { sub: 'clinician-1' },
    );

    expect(repository.createContent).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Con_bò đang gặm cỏ xanh ngoài đồng vào buổi sáng sớm.',
        created_by: 'clinician-1',
        word_count: 11,
      }),
    );
    expect(result).not.toHaveProperty('created_by');
    expect(result).not.toHaveProperty('deleted_at');
    expect(result.word_count).toBe(11);
  });

  it('should preprocess exact hybrid example before saving', async () => {
    repository.createContent.mockResolvedValue({
      id: 'content-hybrid-1',
      title: 'Hybrid',
      body: 'con_bò ăn cỏ',
      difficulty: 'EASY',
      age_group: '5-7',
      word_count: 3,
      created_at: new Date('2026-03-15T00:00:00.000Z'),
    });

    const result = await service.createContent(
      {
        title: 'Hybrid',
        body: 'con bò ăn cỏ',
        difficulty: 'EASY',
        age_group: '5-7',
      },
      { sub: 'clinician-1' },
    );

    expect(repository.createContent).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'con_bò ăn cỏ',
        word_count: 3,
      }),
    );
    expect(result.body).toBe('con_bò ăn cỏ');
  });

  it('should normalize spacing and preserve compact string payload', async () => {
    repository.createContent.mockResolvedValue({
      id: 'content-hybrid-2',
      title: 'Hybrid spacing',
      body: 'con_bò ăn cỏ\n\ncon_chim bay',
      difficulty: 'EASY',
      age_group: '5-7',
      word_count: 5,
      created_at: new Date('2026-03-15T00:00:00.000Z'),
    });

    await service.createContent(
      {
        title: 'Hybrid spacing',
        body: '  con   bò   ăn   cỏ\n\n\ncon  chim bay  ',
        difficulty: 'EASY',
        age_group: '5-7',
      },
      { sub: 'clinician-1' },
    );

    expect(repository.createContent).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'con_bò ăn cỏ\n\ncon_chim bay',
        word_count: 5,
      }),
    );
  });

  it('should update content and recalculate word_count when body changes', async () => {
    repository.findById.mockResolvedValue({
      id: 'content-2',
      title: 'Old title',
      body: 'Old body text that is long enough for the minimum validation constraint.',
    });
    repository.updateContent.mockResolvedValue({
      id: 'content-2',
      title: 'New title',
      body: 'con_mèo chạy nhanh qua sân nhà trong chiều mưa nhẹ.',
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

    expect(repository.updateContent).toHaveBeenCalledWith(
      'content-2',
      expect.objectContaining({
        body: 'con_mèo chạy nhanh qua sân nhà trong chiều mưa nhẹ.',
        word_count: 10,
      }),
    );
    expect(result.word_count).toBe(10);
  });

  it('should get content detail by id', async () => {
    repository.findById.mockResolvedValue({
      id: 'content-42',
      title: 'Chi tiet',
      body: 'con_bò ăn cỏ',
      difficulty: 'EASY',
      age_group: '5-7',
      word_count: 3,
      cover_image_url: null,
      created_at: new Date('2026-03-15T00:00:00.000Z'),
    });

    const result = await service.getContentById('content-42');

    expect(repository.findById).toHaveBeenCalledWith('content-42');
    expect(result).toEqual(
      expect.objectContaining({
        id: 'content-42',
        body: 'con_bò ăn cỏ',
      }),
    );
  });

  it('should return paginated content data with metadata', async () => {
    repository.findPaginated.mockResolvedValue([
      {
        id: 'a',
        title: 'A',
        body: 'Body A',
        difficulty: 'EASY',
        age_group: '5-7',
        word_count: 2,
        created_by: 'x',
        deleted_at: null,
        created_at: new Date('2026-03-15T00:00:00.000Z'),
      },
      {
        id: 'b',
        title: 'B',
        body: 'Body B',
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

    expect(repository.findPaginated).toHaveBeenCalledWith({
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
  });

  it('should soft delete content', async () => {
    repository.softDelete.mockResolvedValue(true);

    const result = await service.deleteContent('content-3');

    expect(repository.softDelete).toHaveBeenCalledWith('content-3');
    expect(result).toEqual({ message: 'Content deleted' });
  });

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
});
