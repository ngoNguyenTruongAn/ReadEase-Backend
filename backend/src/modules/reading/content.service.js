const { Injectable, Inject, NotFoundException } = require('@nestjs/common');
const { ContentRepository } = require('./content.repository');

class ContentService {
	constructor(contentRepository) {
		this.contentRepository = contentRepository;
	}

	calculateWordCount(body) {
		if (!body || !body.trim()) {
			return 0;
		}

		return body.trim().split(/\s+/).length;
	}

	serializeContent(content) {
		return {
			id: content.id,
			title: content.title,
			body: content.body,
			difficulty: content.difficulty,
			age_group: content.age_group,
			word_count: content.word_count,
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
			data: items.map((item) => this.serializeContent(item)),
			meta: {
				page: filters.page,
				limit: filters.limit,
				total,
				totalPages,
			},
		};
	}

	async createContent(dto, user) {
		const created = await this.contentRepository.createContent({
			title: dto.title,
			body: dto.body,
			difficulty: dto.difficulty,
			age_group: dto.age_group,
			word_count: this.calculateWordCount(dto.body),
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
			updatePayload.word_count = this.calculateWordCount(dto.body);
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
