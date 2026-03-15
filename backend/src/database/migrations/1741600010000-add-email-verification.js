// src/database/migrations/1741600010000-add-email-verification.js

/**
 * TASK: Add email verification + OTP support
 * - Add email_verified column to users
 * - Change is_active default to false (activated after email verify)
 * - Create otp_codes table for OTP storage
 */
module.exports = class AddEmailVerification1741600010000 {
  name = 'AddEmailVerification1741600010000';

  async up(queryRunner) {
    // Add email_verified column
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
    `);

    // Change is_active default to false for new registrations
    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN is_active SET DEFAULT false;
    `);

    // Create OTP codes table
    await queryRunner.query(`
      CREATE TABLE otp_codes (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code VARCHAR(6) NOT NULL,
        type VARCHAR(20) NOT NULL
          CHECK (type IN ('EMAIL_VERIFY', 'FORGOT_PASSWORD')),
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_otp_user_type
      ON otp_codes (user_id, type)
      WHERE used = false;
    `);

    // Mark existing users as verified + active
    await queryRunner.query(`
      UPDATE users
      SET email_verified = true, is_active = true
      WHERE email_verified IS NULL OR email_verified = false;
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS otp_codes CASCADE;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS email_verified;`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN is_active SET DEFAULT true;`);
  }
};
