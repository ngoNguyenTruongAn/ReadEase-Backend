const { MigrationInterface, QueryRunner } = require('typeorm');

module.exports = class DropBodyColumns1743000002000 {
  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE "reading_content"
      DROP COLUMN "body",
      DROP COLUMN "body_segmented";
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE "reading_content"
      ADD COLUMN "body" text,
      ADD COLUMN "body_segmented" text;
    `);
  }
};
