const { EntitySchema } = require('typeorm');

const ReadingContentEntity = new EntitySchema({
  name: 'ReadingContent',
  tableName: 'reading_content',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    title: {
      type: 'varchar',
      length: 255,
    },
    body: {
      type: 'text',
    },
    difficulty: {
      type: 'varchar',
      length: 20,
      nullable: true,
    },
    age_group: {
      type: 'varchar',
      length: 20,
      nullable: true,
    },
    word_count: {
      type: 'int',
    },
    created_by: {
      type: 'uuid',
      nullable: true,
    },
    created_at: {
      type: 'timestamptz',
      createDate: true,
    },
    updated_at: {
      type: 'timestamptz',
      updateDate: true,
    },
    deleted_at: {
      type: 'timestamptz',
      nullable: true,
      deleteDate: true,
    },
  },
  relations: {
    creator: {
      type: 'many-to-one',
      target: 'User',
      joinColumn: { name: 'created_by' },
      onDelete: 'SET NULL',
      nullable: true,
    },
    sessions: {
      type: 'one-to-many',
      target: 'ReadingSession',
      inverseSide: 'content',
    },
  },
});

module.exports = { ReadingContentEntity };
