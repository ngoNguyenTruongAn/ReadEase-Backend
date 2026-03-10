// src/database/migrations/1741600001000-create-users.js

/**
 * TASK-008: Create users table
 * - Core table, all other tables reference users.id
 * - Soft delete via deleted_at
 * - CHECK constraint on role
 * - Indexes: unique email, partial on role (active only)
 */
module.exports = class CreateUsers1741600001000 {
  name = 'CreateUsers1741600001000';

  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE users (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(100),
        role VARCHAR(20) NOT NULL
          CHECK (role IN ('ROLE_CHILD', 'ROLE_CLINICIAN', 'ROLE_GUARDIAN')),
        is_active BOOLEAN DEFAULT true,
        last_login_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        deleted_at TIMESTAMP WITH TIME ZONE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_users_role ON users (role) WHERE deleted_at IS NULL;
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS users CASCADE;`);
  }
};
