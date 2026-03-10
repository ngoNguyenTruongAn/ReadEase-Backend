const { EntitySchema } = require('typeorm');

const RedemptionEntity = new EntitySchema({
  name: 'Redemption',
  tableName: 'redemptions',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    child_id: {
      type: 'uuid',
    },
    reward_id: {
      type: 'uuid',
    },
    cost: {
      type: 'int',
    },
    redeemed_at: {
      type: 'timestamptz',
      default: () => 'NOW()',
    },
  },
  relations: {
    child: {
      type: 'many-to-one',
      target: 'User',
      joinColumn: { name: 'child_id' },
    },
    reward: {
      type: 'many-to-one',
      target: 'Reward',
      joinColumn: { name: 'reward_id' },
    },
  },
});

module.exports = { RedemptionEntity };
