const { EntitySchema } = require('typeorm');

const SessionReplayEventEntity = new EntitySchema({
  name: 'SessionReplayEvent',
  tableName: 'session_replay_events',
  columns: {
    id: {
      type: 'bigint',
      primary: true,
      generated: 'increment',
    },
    session_id: {
      type: 'uuid',
    },
    event_type: {
      type: 'varchar',
      length: 50,
    },
    payload: {
      type: 'jsonb',
    },
    cognitive_state: {
      type: 'varchar',
      length: 20,
      nullable: true,
    },
    intervention_type: {
      type: 'varchar',
      length: 20,
      nullable: true,
    },
    timestamp: {
      type: 'bigint',
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

module.exports = { SessionReplayEventEntity };
