// src/database/migrations/1741600004000-create-reading-content.js

/**
 * TASK-010: Create reading_content table
 * - Soft delete via deleted_at
 * - created_by FK to users (SET NULL on delete)
 * - CHECK constraint on difficulty
 */
module.exports = class CreateReadingContent1741600004000 {
  name = 'CreateReadingContent1741600004000';

  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE reading_content (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        difficulty VARCHAR(20) CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
        age_group VARCHAR(20),
        word_count INTEGER NOT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        deleted_at TIMESTAMP WITH TIME ZONE
      );
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS reading_content CASCADE;`);
  }
};
