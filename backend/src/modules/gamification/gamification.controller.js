require('reflect-metadata');

const {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  HttpCode,
  BadRequestException,
  ForbiddenException,
  Inject,
} = require('@nestjs/common');

const { JwtAuthGuard } = require('../auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../auth/guards/roles.guard');
const { Roles } = require('../auth/decorators/roles.decorator');

const { TokenService } = require('./gamification.service');
const HistoryQueryDto = require('./dto/history-query.dto');
const CreateRewardDto = require('./dto/create-reward.dto');
const UpdateRewardDto = require('./dto/update-reward.dto');
const RedeemRewardDto = require('./dto/redeem-reward.dto');
const SetAvatarDto = require('./dto/set-avatar.dto');

class GamificationController {
  constructor(tokenService) {
    this.tokenService = tokenService;
  }

  validateChildId(childId) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(childId);
    if (!isUuid) {
      throw new BadRequestException('childId must be a valid UUID');
    }
  }

  assertChildAccess(childId, user) {
    if (user?.role === 'ROLE_CHILD' && user?.sub !== childId) {
      throw new ForbiddenException('Children can only access their own token data');
    }
  }

  async getBalance(childId, req) {
    this.validateChildId(childId);
    this.assertChildAccess(childId, req.user);

    const result = await this.tokenService.getBalance(childId);
    return result;
  }

  async getHistory(childId, query, req) {
    this.validateChildId(childId);
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

  async createReward(body) {
    const { error, value } = CreateRewardDto.schema.validate(body);
    if (error) {
      throw new BadRequestException(error.details[0].message);
    }
    return this.tokenService.createReward(value);
  }

  async updateReward(rewardId, body) {
    this.validateChildId(rewardId); // reuses UUID validator
    const { error, value } = UpdateRewardDto.schema.validate(body);
    if (error) {
      throw new BadRequestException(error.details[0].message);
    }
    return this.tokenService.updateReward(rewardId, value);
  }

  async deleteReward(rewardId) {
    this.validateChildId(rewardId); // reuses UUID validator
    return this.tokenService.deleteReward(rewardId);
  }

  async redeemReward(rewardId, body, req) {
    const { error, value } = RedeemRewardDto.schema.validate(body);
    if (error) {
      throw new BadRequestException(error.details[0].message);
    }

    this.validateChildId(value.childId);
    this.assertChildAccess(value.childId, req.user);

    this.validateChildId(rewardId);

    const result = await this.tokenService.redeemReward(
      value.childId,
      rewardId,
      value.expectedVersion,
    );
    return result;
  }

  async getCollection(childId, req) {
    this.validateChildId(childId);
    this.assertChildAccess(childId, req.user);
    return this.tokenService.getCollection(childId);
  }

  async setMyAvatar(body, req) {
    const { error, value } = SetAvatarDto.schema.validate(body);
    if (error) {
      throw new BadRequestException(error.details[0].message);
    }

    this.validateChildId(value.rewardId);
    return this.tokenService.setChildAvatar(req.user.sub, value.rewardId);
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

// ── POST /rewards (Protected: ROLE_CLINICIAN) — Create reward ──
const createRewardDescriptor = Object.getOwnPropertyDescriptor(
  GamificationController.prototype,
  'createReward',
);
Reflect.decorate(
  [Post('rewards'), HttpCode(201), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_CLINICIAN')],
  GamificationController.prototype,
  'createReward',
  createRewardDescriptor,
);
Body()(GamificationController.prototype, 'createReward', 0);

// ── PUT /rewards/:rewardId (Protected: ROLE_CLINICIAN) — Update reward ──
const updateRewardDescriptor = Object.getOwnPropertyDescriptor(
  GamificationController.prototype,
  'updateReward',
);
Reflect.decorate(
  [Put('rewards/:rewardId'), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_CLINICIAN')],
  GamificationController.prototype,
  'updateReward',
  updateRewardDescriptor,
);
Param('rewardId')(GamificationController.prototype, 'updateReward', 0);
Body()(GamificationController.prototype, 'updateReward', 1);

// ── DELETE /rewards/:rewardId (Protected: ROLE_CLINICIAN) — Delete reward ──
const deleteRewardDescriptor = Object.getOwnPropertyDescriptor(
  GamificationController.prototype,
  'deleteReward',
);
Reflect.decorate(
  [Delete('rewards/:rewardId'), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_CLINICIAN')],
  GamificationController.prototype,
  'deleteReward',
  deleteRewardDescriptor,
);
Param('rewardId')(GamificationController.prototype, 'deleteReward', 0);

// ── POST /rewards/:rewardId/redeem (Protected) — Redeem reward ──
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

// ── GET /tokens/:childId/collection (Protected) — Get reward collection ──
const getCollectionDescriptor = Object.getOwnPropertyDescriptor(
  GamificationController.prototype,
  'getCollection',
);
Reflect.decorate(
  [
    Get('tokens/:childId/collection'),
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ROLE_CHILD', 'ROLE_GUARDIAN', 'ROLE_CLINICIAN'),
  ],
  GamificationController.prototype,
  'getCollection',
  getCollectionDescriptor,
);
Param('childId')(GamificationController.prototype, 'getCollection', 0);
Req()(GamificationController.prototype, 'getCollection', 1);

// ── PATCH /children/me/avatar (Protected: ROLE_CHILD) — Set current avatar ──
const setMyAvatarDescriptor = Object.getOwnPropertyDescriptor(
  GamificationController.prototype,
  'setMyAvatar',
);
Reflect.decorate(
  [Patch('children/me/avatar'), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_CHILD')],
  GamificationController.prototype,
  'setMyAvatar',
  setMyAvatarDescriptor,
);
Body()(GamificationController.prototype, 'setMyAvatar', 0);
Req()(GamificationController.prototype, 'setMyAvatar', 1);

module.exports = { GamificationController };
