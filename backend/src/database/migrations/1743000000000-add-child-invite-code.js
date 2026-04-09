// src/database/migrations/1743000000000-add-child-invite-code.js

module.exports = class AddChildInviteCode1743000000000 {
  name = 'AddChildInviteCode1743000000000';

  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN guardian_invite_code VARCHAR(10) UNIQUE DEFAULT NULL,
      ADD COLUMN guardian_invite_code_expires_at TIMESTAMPTZ DEFAULT NULL;

      CREATE INDEX idx_guardian_invite_code ON users(guardian_invite_code);
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`
      DROP INDEX idx_guardian_invite_code;
      ALTER TABLE users 
      DROP COLUMN guardian_invite_code,
      DROP COLUMN guardian_invite_code_expires_at;
    `);
  }
};
