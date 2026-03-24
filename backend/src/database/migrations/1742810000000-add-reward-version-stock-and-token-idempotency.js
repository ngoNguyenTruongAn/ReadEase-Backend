module.exports = class AddRewardVersionStockAndTokenIdempotency1742810000000 {
  name = 'AddRewardVersionStockAndTokenIdempotency1742810000000';

  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE rewards
      ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS stock INTEGER
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_rewards_is_active ON rewards (is_active)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_tokens_session_type_earn_bonus
      ON tokens (session_id, type)
      WHERE session_id IS NOT NULL AND type IN ('EARN', 'BONUS')
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`
      DROP INDEX IF EXISTS ux_tokens_session_type_earn_bonus
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_rewards_is_active
    `);

    await queryRunner.query(`
      ALTER TABLE rewards
      DROP COLUMN IF EXISTS stock,
      DROP COLUMN IF EXISTS version
    `);
  }
};
