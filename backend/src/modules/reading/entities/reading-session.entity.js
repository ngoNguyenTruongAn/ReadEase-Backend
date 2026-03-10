const { EntitySchema } = require('typeorm');

const ReadingSessionEntity = new EntitySchema({
  name: 'ReadingSession',
  tableName: 'reading_sessions',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    user_id: {
      type: 'uuid',
    },
    content_id: {
      type: 'uuid',
    },
    status: {
      type: 'varchar',
      length: 20,
      default: 'ACTIVE',
    },
    started_at: {
      type: 'timestamptz',
      default: () => 'NOW()',
    },
    ended_at: {
      type: 'timestamptz',
      nullable: true,
    },
    effort_score: {
      type: 'decimal',
      precision: 5,
      scale: 4,
      default: 0.0,
    },
    cognitive_state_summary: {
      type: 'jsonb',
      nullable: true,
      default: () => "'{}'",
    },
    settings: {
      type: 'jsonb',
      nullable: true,
      default: () => "'{}'",
    },
    created_at: {
      type: 'timestamptz',
      createDate: true,
    },
  },
  relations: {
    user: {
      type: 'many-to-one',
      target: 'User',
      joinColumn: { name: 'user_id' },
    },
    content: {
      type: 'many-to-one',
      target: 'ReadingContent',
      joinColumn: { name: 'content_id' },
    },
    mouseEvents: {
      type: 'one-to-many',
      target: 'MouseEvent',
      inverseSide: 'session',
    },
    replayEvents: {
      type: 'one-to-many',
      target: 'SessionReplayEvent',
      inverseSide: 'session',
    },
    tokens: {
      type: 'one-to-many',
      target: 'Token',
      inverseSide: 'session',
    },
  },
});

module.exports = { ReadingSessionEntity };
