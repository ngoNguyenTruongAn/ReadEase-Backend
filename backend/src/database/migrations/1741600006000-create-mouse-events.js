// src/database/migrations/1741600006000-create-mouse-events.js

/**
 * TASK-012: Create mouse_events table
 * - BIGSERIAL PK for high-volume inserts (~6M rows/month)
 * - FK to reading_sessions with CASCADE delete
 * - Composite index on (session_id, timestamp) for replay
 * - SMALLINT for x/y (viewport coords 0-32767)
 * - REAL for kinematic features (velocity, acceleration, curvature, dwell_time)
 */
module.exports = class CreateMouseEvents1741600006000 {
  name = 'CreateMouseEvents1741600006000';

  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE mouse_events (
        id BIGSERIAL PRIMARY KEY,
        session_id UUID NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE,
        x SMALLINT NOT NULL,
        y SMALLINT NOT NULL,
        timestamp BIGINT NOT NULL,
        word_index INTEGER,
        velocity REAL,
        acceleration REAL,
        curvature REAL,
        dwell_time REAL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_mouse_events_session_ts
        ON mouse_events (session_id, timestamp);
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS mouse_events CASCADE;`);
  }
};
