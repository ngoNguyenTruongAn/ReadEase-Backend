const { EntitySchema } = require('typeorm');

const RewardEntity = new EntitySchema({
  name: 'Reward',
  tableName: 'rewards',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    name: {
      type: 'varchar',
      length: 100,
    },
    description: {
      type: 'text',
      nullable: true,
    },
    cost: {
      type: 'int',
    },
    image_url: {
      type: 'varchar',
      length: 500,
      nullable: true,
    },
    is_active: {
      type: 'boolean',
      default: true,
    },
    created_at: {
      type: 'timestamptz',
      createDate: true,
    },
  },
  relations: {
    redemptions: {
      type: 'one-to-many',
      target: 'Redemption',
      inverseSide: 'reward',
    },
  },
});

module.exports = { RewardEntity };
