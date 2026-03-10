const { EntitySchema } = require('typeorm');

const MouseEventEntity = new EntitySchema({
  name: 'MouseEvent',
  tableName: 'mouse_events',
  columns: {
    id: {
      type: 'bigint',
      primary: true,
      generated: 'increment',
    },
    session_id: {
      type: 'uuid',
    },
    x: {
      type: 'smallint',
    },
    y: {
      type: 'smallint',
    },
    timestamp: {
      type: 'bigint',
    },
    word_index: {
      type: 'int',
      nullable: true,
    },
    velocity: {
      type: 'real',
      nullable: true,
    },
    acceleration: {
      type: 'real',
      nullable: true,
    },
    curvature: {
      type: 'real',
      nullable: true,
    },
    dwell_time: {
      type: 'real',
      nullable: true,
    },
    created_at: {
      type: 'timestamptz',
      createDate: true,
    },
  },
  relations: {
    session: {
      type: 'many-to-one',
      target: 'ReadingSession',
      joinColumn: { name: 'session_id' },
      onDelete: 'CASCADE',
    },
  },
});

module.exports = { MouseEventEntity };
