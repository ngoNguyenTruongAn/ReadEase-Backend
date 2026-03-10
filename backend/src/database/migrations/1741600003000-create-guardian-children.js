// src/database/migrations/1741600003000-create-guardian-children.js

/**
 * TASK-016: Create guardian_children junction table
 * - N:M between users (guardian ↔ child)
 * - Composite PK (guardian_id, child_id)
 * - COPPA consent tracking
 * - CASCADE both sides
 */
module.exports = class CreateGuardianChildren1741600003000 {
  name = 'CreateGuardianChildren1741600003000';

  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE guardian_children (
        guardian_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        child_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        consent_given_at TIMESTAMP WITH TIME ZONE NOT NULL,
        consent_type VARCHAR(50) DEFAULT 'COPPA_PARENTAL',
        PRIMARY KEY (guardian_id, child_id)
      );
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS guardian_children CASCADE;`);
  }
};
