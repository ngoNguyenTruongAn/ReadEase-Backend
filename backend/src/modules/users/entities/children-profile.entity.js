const { EntitySchema } = require('typeorm');

const ChildrenProfileEntity = new EntitySchema({
  name: 'ChildrenProfile',
  tableName: 'children_profiles',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    user_id: {
      type: 'uuid',
      unique: true,
    },
    date_of_birth: {
      type: 'date',
      nullable: true,
    },
    grade_level: {
      type: 'int',
      nullable: true,
    },
    baseline_json: {
      type: 'jsonb',
      nullable: true,
    },
    preferences: {
      type: 'jsonb',
      nullable: true,
      default: () => "'{}'",
    },
    current_avatar_reward_id: {
      type: 'uuid',
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
  },
  relations: {
    user: {
      type: 'one-to-one',
      target: 'User',
      joinColumn: { name: 'user_id' },
      onDelete: 'CASCADE',
    },
    currentAvatarReward: {
      type: 'many-to-one',
      target: 'Reward',
      joinColumn: { name: 'current_avatar_reward_id' },
      nullable: true,
      onDelete: 'SET NULL',
    },
  },
});

module.exports = { ChildrenProfileEntity };
