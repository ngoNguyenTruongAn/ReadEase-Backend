module.exports = class AddBodySegmented1742811000000 {
  async up(queryRunner) {
    await queryRunner.query(
      `ALTER TABLE "reading_content" ADD COLUMN IF NOT EXISTS "body_segmented" text`,
    );
  }

  async down(queryRunner) {
    await queryRunner.query(`ALTER TABLE "reading_content" DROP COLUMN "body_segmented"`);
  }
};
