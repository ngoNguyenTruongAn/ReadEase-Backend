const { EntitySchema } = require('typeorm');

const UserEntity = new EntitySchema({
  name: 'User',
  tableName: 'users',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    email: {
      type: 'varchar',
      length: 255,
      unique: true,
    },
    password_hash: {
      type: 'varchar',
      length: 255,
    },
    display_name: {
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    role: {
      type: 'varchar',
      length: 20,
    },
    email_verified: {
      type: 'boolean',
      default: false,
    },
    is_active: {
      type: 'boolean',
      default: false,
    },
    last_login_at: {
      type: 'timestamptz',
      nullable: true,
    },
    guardian_invite_code: {
      type: 'varchar',
      length: 10,
      nullable: true,
      unique: true,
    },
    guardian_invite_code_expires_at: {
      type: 'timestamptz',
      nullable: true,
    },
    created_at: {
      type: 'timestamptz',
      createDate: true,
    },
    updated_at: {
      type: 'timestamptz',
      updateDate: true,
    },
    deleted_at: {
      type: 'timestamptz',
      nullable: true,
      deleteDate: true,
    },
  },
  relations: {
    childProfile: {
      type: 'one-to-one',
      target: 'ChildrenProfile',
      inverseSide: 'user',
    },
    sessions: {
      type: 'one-to-many',
      target: 'ReadingSession',
      inverseSide: 'user',
    },
    tokens: {
      type: 'one-to-many',
      target: 'Token',
      inverseSide: 'child',
    },
    redemptions: {
      type: 'one-to-many',
      target: 'Redemption',
      inverseSide: 'child',
    },
    reports: {
      type: 'one-to-many',
      target: 'Report',
      inverseSide: 'child',
    },
  },
});

module.exports = { UserEntity };
