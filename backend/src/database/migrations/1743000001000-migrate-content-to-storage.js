const { MigrationInterface, QueryRunner } = require('typeorm');

module.exports = class MigrateContentToStorage1743000001000 {
  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE "reading_content"
      ADD COLUMN "body_url" varchar(1000),
      ADD COLUMN "body_segmented_url" varchar(1000);
    `);

    await queryRunner.query(`
      ALTER TABLE "reading_content"
      ALTER COLUMN "body" DROP NOT NULL;
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE "reading_content"
      ALTER COLUMN "body" SET NOT NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "reading_content"
      DROP COLUMN "body_url",
      DROP COLUMN "body_segmented_url";
    `);
  }
};
