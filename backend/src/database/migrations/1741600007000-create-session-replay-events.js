// src/database/migrations/1741600007000-create-session-replay-events.js

/**
 * TASK-013: Create session_replay_events table
 * - BIGSERIAL PK
 * - FK to reading_sessions with CASCADE delete
 * - JSONB for polymorphic payload (different event_types have different data)
 * - Composite index on (session_id, timestamp) for replay timeline
 */
module.exports = class CreateSessionReplayEvents1741600007000 {
  name = 'CreateSessionReplayEvents1741600007000';

  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE session_replay_events (
        id BIGSERIAL PRIMARY KEY,
        session_id UUID NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL,
        cognitive_state VARCHAR(20),
        intervention_type VARCHAR(20),
        timestamp BIGINT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_replay_session_ts
        ON session_replay_events (session_id, timestamp);
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS session_replay_events CASCADE;`);
  }
};
