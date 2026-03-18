/**
 * Migration: Add cover_image_url to reading_content
 *
 * Follows postgres-migration-safety SKILL:
 * - Add column as nullable first
 * - One concern per migration
 * - up() and down() methods
 */

module.exports = class AddCoverImageUrl1710752892000 {
  name = 'AddCoverImageUrl1710752892000';

  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE reading_content
      ADD COLUMN cover_image_url VARCHAR(500);
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE reading_content
      DROP COLUMN IF EXISTS cover_image_url;
    `);
  }
};
