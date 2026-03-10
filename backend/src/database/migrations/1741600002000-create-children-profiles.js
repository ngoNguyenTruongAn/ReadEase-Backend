// src/database/migrations/1741600002000-create-children-profiles.js

/**
 * TASK-009: Create children_profiles table
 * - 1:1 with users (UNIQUE user_id)
 * - JSONB for baseline + preferences
 * - CASCADE on user delete
 */
module.exports = class CreateChildrenProfiles1741600002000 {
  name = 'CreateChildrenProfiles1741600002000';

  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE children_profiles (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        date_of_birth DATE,
        grade_level INTEGER,
        baseline_json JSONB,
        preferences JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS children_profiles CASCADE;`);
  }
};
