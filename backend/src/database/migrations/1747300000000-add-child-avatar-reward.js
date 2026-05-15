module.exports = class AddChildAvatarReward1747300000000 {
  name = 'AddChildAvatarReward1747300000000';

  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE children_profiles
      ADD COLUMN IF NOT EXISTS current_avatar_reward_id UUID
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_children_profiles_current_avatar_reward'
        ) THEN
          ALTER TABLE children_profiles
          ADD CONSTRAINT fk_children_profiles_current_avatar_reward
          FOREIGN KEY (current_avatar_reward_id)
          REFERENCES rewards(id)
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE children_profiles
      DROP CONSTRAINT IF EXISTS fk_children_profiles_current_avatar_reward
    `);

    await queryRunner.query(`
      ALTER TABLE children_profiles
      DROP COLUMN IF EXISTS current_avatar_reward_id
    `);
  }
};
