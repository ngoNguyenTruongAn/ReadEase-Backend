// src/database/migrations/1741600005000-create-reading-sessions.js

/**
 * TASK-011: Create reading_sessions table
 * - FK to users + reading_content (NO ACTION on delete)
 * - CHECK constraint on status
 * - JSONB for cognitive_state_summary + settings
 * - Partial index on status (ACTIVE only)
 */
module.exports = class CreateReadingSessions1741600005000 {
  name = 'CreateReadingSessions1741600005000';

  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE reading_sessions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id),
        content_id UUID NOT NULL REFERENCES reading_content(id),
        status VARCHAR(20) DEFAULT 'ACTIVE'
          CHECK (status IN ('ACTIVE', 'COMPLETED', 'ABANDONED')),
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        ended_at TIMESTAMP WITH TIME ZONE,
        effort_score DECIMAL(5,4) DEFAULT 0.0,
        cognitive_state_summary JSONB DEFAULT '{}',
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_sessions_user_id ON reading_sessions (user_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_sessions_status ON reading_sessions (status) WHERE status = 'ACTIVE';
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS reading_sessions CASCADE;`);
  }
};
