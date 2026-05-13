module.exports = class AddReportApprovalWorkflow1747100000000 {
  name = 'AddReportApprovalWorkflow1747100000000';

  async up(queryRunner) {
    // Add status column with DRAFT as default
    await queryRunner.query(`
      ALTER TABLE reports
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'DRAFT'
    `);

    // Add approved_by (clinician UUID who approved)
    await queryRunner.query(`
      ALTER TABLE reports
      ADD COLUMN IF NOT EXISTS approved_by UUID
    `);

    // Add approved_at timestamp
    await queryRunner.query(`
      ALTER TABLE reports
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ
    `);

    // Set existing reports to APPROVED (backward compatibility)
    await queryRunner.query(`
      UPDATE reports SET status = 'APPROVED' WHERE status IS NULL
    `);

    // Index for fast filtering by status
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status)
    `);

    // Index for filtering by child + status (Guardian query)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_reports_child_status ON reports (child_id, status)
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_reports_child_status
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_reports_status
    `);

    await queryRunner.query(`
      ALTER TABLE reports
      DROP COLUMN IF EXISTS approved_at,
      DROP COLUMN IF EXISTS approved_by,
      DROP COLUMN IF EXISTS status
    `);
  }
};
