// src/database/migrations/1743100000000-drop-otp-codes-table.js

/**
 * Drop otp_codes table — OTP management fully migrated to Redis.
 * The otp_codes PostgreSQL table is no longer read or written to.
 */
module.exports = class DropOtpCodesTable1743100000000 {
  name = 'DropOtpCodesTable1743100000000';

  async up(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS otp_codes CASCADE;`);
  }

  async down(queryRunner) {
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

      CREATE INDEX idx_otp_user_type
      ON otp_codes (user_id, type)
      WHERE used = false;
    `);
  }
};
