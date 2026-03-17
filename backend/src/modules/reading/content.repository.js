const { Injectable } = require('@nestjs/common');
const { InjectRepository } = require('@nestjs/typeorm');
const { IsNull } = require('typeorm');

const { ReadingContentEntity } = require('./entities/reading-content.entity');

class ContentRepository {
  constructor(contentRepository) {
    this.contentRepository = contentRepository;
  }

  buildFiltersQuery(filters = {}) {
    const query = this.contentRepository
      .createQueryBuilder('content')
      .where('content.deleted_at IS NULL');

    if (filters.difficulty) {
      query.andWhere('content.difficulty = :difficulty', {
        difficulty: filters.difficulty,
      });
    }

    if (filters.age_group) {
      query.andWhere('content.age_group = :age_group', {
        age_group: filters.age_group,
      });
    }

    return query;
  }

  async findPaginated(filters) {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const offset = (page - 1) * limit;

    return this.buildFiltersQuery(filters)
      .orderBy('content.created_at', 'DESC')
      .limit(limit)
      .offset(offset)
      .getMany();
  }

  async count(filters) {
    return this.buildFiltersQuery(filters).getCount();
  }

  async findById(id) {
    return this.contentRepository.findOne({
      where: {
        id,
        deleted_at: IsNull(),
      },
    });
  }

  async createContent(data) {
    const entity = this.contentRepository.create(data);
    return this.contentRepository.save(entity);
  }

  async updateContent(id, data) {
    const result = await this.contentRepository.update(
      {
        id,
        deleted_at: IsNull(),
      },
      data,
    );

    if (!result.affected) {
      return null;
    }

    return this.findById(id);
  }

  async softDelete(id) {
    const result = await this.contentRepository.update(
      {
        id,
        deleted_at: IsNull(),
      },
      {
        deleted_at: new Date(),
      },
    );

    return Boolean(result.affected);
  }
}

InjectRepository(ReadingContentEntity)(ContentRepository, undefined, 0);
Injectable()(ContentRepository);

module.exports = { ContentRepository };
