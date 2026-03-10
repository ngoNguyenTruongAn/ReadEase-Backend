const { EntitySchema } = require('typeorm');

const TokenEntity = new EntitySchema({
  name: 'Token',
  tableName: 'tokens',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    child_id: {
      type: 'uuid',
    },
    amount: {
      type: 'int',
    },
    type: {
      type: 'varchar',
      length: 20,
      nullable: true,
    },
    reason: {
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    effort_score: {
      type: 'decimal',
      precision: 5,
      scale: 4,
      nullable: true,
    },
    session_id: {
      type: 'uuid',
      nullable: true,
    },
    created_at: {
      type: 'timestamptz',
      createDate: true,
    },
  },
  relations: {
    child: {
      type: 'many-to-one',
      target: 'User',
      joinColumn: { name: 'child_id' },
    },
    session: {
      type: 'many-to-one',
      target: 'ReadingSession',
      joinColumn: { name: 'session_id' },
      onDelete: 'SET NULL',
      nullable: true,
    },
  },
});

module.exports = { TokenEntity };
