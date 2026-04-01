require('reflect-metadata');

const { Module } = require('@nestjs/common');
const { TypeOrmModule } = require('@nestjs/typeorm');

const { TokenEntity } = require('./entities/token.entity');
const { RewardEntity } = require('./entities/reward.entity');
const { RedemptionEntity } = require('./entities/redemption.entity');
const { ReadingSessionEntity } = require('../reading/entities/reading-session.entity');

const { TokenService } = require('./gamification.service');
const { GamificationController } = require('./gamification.controller');

class GamificationModule {}

Module({
  imports: [
    TypeOrmModule.forFeature([TokenEntity, RewardEntity, RedemptionEntity, ReadingSessionEntity]),
  ],
  controllers: [GamificationController],
  providers: [TokenService],
  exports: [TokenService],
})(GamificationModule);

module.exports = { GamificationModule };
