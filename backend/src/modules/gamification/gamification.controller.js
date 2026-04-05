require('reflect-metadata');

const {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  ForbiddenException,
  Inject,
} = require('@nestjs/common');

const { JwtAuthGuard } = require('../auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../auth/guards/roles.guard');
const { Roles } = require('../auth/decorators/roles.decorator');

const { TokenService } = require('./gamification.service');
const HistoryQueryDto = require('./dto/history-query.dto');
const RedeemRewardDto = require('./dto/redeem-reward.dto');

class GamificationController {
  constructor(tokenService) {
    this.tokenService = tokenService;
  }

  validateUuid(value, fieldName = 'id') {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    if (!isUuid) {
      throw new BadRequestException(`${fieldName} must be a valid UUID`);
    }
  }

  assertChildAccess(childId, user) {
    if (user?.role === 'ROLE_CHILD' && user?.sub !== childId) {
      throw new ForbiddenException('Children can only access their own token data');
    }
  }

  async getBalance(childId, req) {
    this.validateUuid(childId, 'childId');
    this.assertChildAccess(childId, req.user);

    const result = await this.tokenService.getBalance(childId);
    return result;
  }

  async getHistory(childId, query, req) {
    this.validateUuid(childId, 'childId');
    this.assertChildAccess(childId, req.user);

    const { error, value } = HistoryQueryDto.schema.validate(query);
    if (error) {
      throw new BadRequestException(error.details[0].message);
    }

    const result = await this.tokenService.getHistory(childId, value.limit, value.offset);
    return result;
  }

  async getRewards() {
    const rewards = await this.tokenService.listActiveRewards();
    return rewards;
  }

  async redeemReward(rewardId, body, req) {
    const { error, value } = RedeemRewardDto.schema.validate(body);
    if (error) {
      throw new BadRequestException(error.details[0].message);
    }

    this.validateUuid(value.childId, 'childId');
    this.assertChildAccess(value.childId, req.user);

    this.validateUuid(rewardId, 'rewardId');

    const result = await this.tokenService.redeemReward(
      value.childId,
      rewardId,
      value.expectedVersion,
    );
    return result;
  }
}

Controller('api/v1')(GamificationController);
Inject(TokenService)(GamificationController, undefined, 0);

const getBalanceDescriptor = Object.getOwnPropertyDescriptor(
  GamificationController.prototype,
  'getBalance',
);
Reflect.decorate(
  [
    Get('tokens/:childId/balance'),
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ROLE_CHILD', 'ROLE_GUARDIAN', 'ROLE_CLINICIAN'),
  ],
  GamificationController.prototype,
  'getBalance',
  getBalanceDescriptor,
);
Param('childId')(GamificationController.prototype, 'getBalance', 0);
Req()(GamificationController.prototype, 'getBalance', 1);

const getHistoryDescriptor = Object.getOwnPropertyDescriptor(
  GamificationController.prototype,
  'getHistory',
);
Reflect.decorate(
  [
    Get('tokens/:childId/history'),
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ROLE_CHILD', 'ROLE_GUARDIAN', 'ROLE_CLINICIAN'),
  ],
  GamificationController.prototype,
  'getHistory',
  getHistoryDescriptor,
);
Param('childId')(GamificationController.prototype, 'getHistory', 0);
Query()(GamificationController.prototype, 'getHistory', 1);
Req()(GamificationController.prototype, 'getHistory', 2);

const getRewardsDescriptor = Object.getOwnPropertyDescriptor(
  GamificationController.prototype,
  'getRewards',
);
Reflect.decorate(
  [
    Get('rewards'),
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ROLE_CHILD', 'ROLE_GUARDIAN', 'ROLE_CLINICIAN'),
  ],
  GamificationController.prototype,
  'getRewards',
  getRewardsDescriptor,
);

const redeemRewardDescriptor = Object.getOwnPropertyDescriptor(
  GamificationController.prototype,
  'redeemReward',
);
Reflect.decorate(
  [
    Post('rewards/:rewardId/redeem'),
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ROLE_CHILD', 'ROLE_GUARDIAN', 'ROLE_CLINICIAN'),
  ],
  GamificationController.prototype,
  'redeemReward',
  redeemRewardDescriptor,
);
Param('rewardId')(GamificationController.prototype, 'redeemReward', 0);
Body()(GamificationController.prototype, 'redeemReward', 1);
Req()(GamificationController.prototype, 'redeemReward', 2);

module.exports = { GamificationController };
