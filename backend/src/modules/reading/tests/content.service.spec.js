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
			body: 'This is a long enough passage body with many words for testing purposes only.',
			difficulty: 'EASY',
			age_group: '5-7',
			word_count: 14,
			created_by: 'clinician-1',
			deleted_at: null,
			created_at: new Date('2026-03-15T00:00:00.000Z'),
		});

		const result = await service.createContent(
			{
				title: 'Sample',
				body: 'This is a long enough passage body with many words for testing purposes only.',
				difficulty: 'EASY',
				age_group: '5-7',
			},
			{ sub: 'clinician-1' },
		);

		expect(repository.createContent).toHaveBeenCalledWith(
			expect.objectContaining({
				created_by: 'clinician-1',
				word_count: 14,
			}),
		);
		expect(result).not.toHaveProperty('created_by');
		expect(result).not.toHaveProperty('deleted_at');
		expect(result.word_count).toBe(14);
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
			body: 'Updated body text now has a different amount of words to count correctly.',
			difficulty: 'MEDIUM',
			age_group: '8-10',
			word_count: 13,
			created_at: new Date('2026-03-15T00:00:00.000Z'),
		});

		const result = await service.updateContent('content-2', {
			title: 'New title',
			body: 'Updated body text now has a different amount of words to count correctly.',
			difficulty: 'MEDIUM',
			age_group: '8-10',
		});

		expect(repository.updateContent).toHaveBeenCalledWith(
			'content-2',
			expect.objectContaining({
				word_count: 13,
			}),
		);
		expect(result.word_count).toBe(13);
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
});
