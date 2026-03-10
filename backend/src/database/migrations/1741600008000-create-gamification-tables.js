// src/database/migrations/1741600008000-create-gamification-tables.js

/**
 * TASK-014: Create tokens, rewards, redemptions tables
 * - tokens: ledger for token economy (earn/spend/bonus)
 * - rewards: catalog of available rewards
 * - redemptions: history of token redemptions
 *
 * Created in single migration because they're closely related
 * and must exist together for referential integrity.
 */
module.exports = class CreateGamificationTables1741600008000 {
  name = 'CreateGamificationTables1741600008000';

  async up(queryRunner) {
    // ── rewards table (no FK dependencies, must come first) ──
    await queryRunner.query(`
      CREATE TABLE rewards (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        cost INTEGER NOT NULL,
        image_url VARCHAR(500),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // ── tokens table ──
    await queryRunner.query(`
      CREATE TABLE tokens (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        child_id UUID NOT NULL REFERENCES users(id),
        amount INTEGER NOT NULL,
        type VARCHAR(20) CHECK (type IN ('EARN', 'SPEND', 'BONUS')),
        reason VARCHAR(255),
        effort_score DECIMAL(5,4),
        session_id UUID REFERENCES reading_sessions(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_tokens_child_id ON tokens (child_id);
    `);

    // ── redemptions table ──
    await queryRunner.query(`
      CREATE TABLE redemptions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        child_id UUID NOT NULL REFERENCES users(id),
        reward_id UUID NOT NULL REFERENCES rewards(id),
        cost INTEGER NOT NULL,
        redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS redemptions CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS tokens CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS rewards CASCADE;`);
  }
};
