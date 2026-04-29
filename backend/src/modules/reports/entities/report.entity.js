const { EntitySchema } = require('typeorm');

const ReportEntity = new EntitySchema({
  name: 'Report',
  tableName: 'reports',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    child_id: {
      type: 'uuid',
    },
    report_type: {
      type: 'varchar',
      length: 20,
      default: 'WEEKLY',
    },
    content: {
      type: 'text',
    },
    ai_model: {
      type: 'varchar',
      length: 50,
      nullable: true,
    },
    ai_disclaimer: {
      type: 'text',
      nullable: true,
      default:
        'Báo cáo này được tạo bởi trí tuệ nhân tạo (AI) và chỉ mang tính tham khảo. Vui lòng tham vấn chuyên gia để được đánh giá chính xác.',
    },
    period_start: {
      type: 'date',
    },
    period_end: {
      type: 'date',
    },
    created_at: {
      type: 'timestamptz',
      createDate: true,
    },
  },
  relations: {
    child: {
      type: 'many-to-one',
      target: 'User',
      joinColumn: { name: 'child_id' },
      onDelete: 'CASCADE',
    },
  },
});

module.exports = { ReportEntity };
