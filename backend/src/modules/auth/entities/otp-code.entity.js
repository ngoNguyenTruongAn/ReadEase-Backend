const { EntitySchema } = require('typeorm');

const OtpCodeEntity = new EntitySchema({
  name: 'OtpCode',
  tableName: 'otp_codes',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    code: {
      type: 'varchar',
      length: 6,
    },
    type: {
      type: 'varchar',
      length: 20,
    },
    used: {
      type: 'boolean',
      default: false,
    },
    expires_at: {
      type: 'timestamptz',
    },
    created_at: {
      type: 'timestamptz',
      createDate: true,
    },
  },
  relations: {
    user: {
      type: 'many-to-one',
      target: 'User',
      joinColumn: { name: 'user_id' },
      onDelete: 'CASCADE',
    },
  },
});

module.exports = { OtpCodeEntity };
