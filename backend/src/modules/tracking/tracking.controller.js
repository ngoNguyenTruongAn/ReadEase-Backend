require('reflect-metadata');

const {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  InternalServerErrorException,
  Inject,
} = require('@nestjs/common');
const { DataSource } = require('typeorm');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { JwtAuthGuard } = require('../auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../auth/guards/roles.guard');
const { Roles } = require('../auth/decorators/roles.decorator');

const MlClientService = require('./services/ml-client.service');
const CalibrateDto = require('./dto/calibrate.dto');
const { logger } = require('../../common/logger/winston.config');

class TrackingController {
  constructor(mlClientService, dataSource) {
    this.mlClientService = mlClientService;
    this.dataSource = dataSource;
  }

  async calibrate(body, req) {
    const { error, value } = CalibrateDto.schema.validate(body);
    if (error) {
      throw new BadRequestException(error.details[0].message);
    }

    const childId = value?.childId || req?.user?.sub;
    if (!childId) {
      throw new BadRequestException('Missing childId');
    }

    const baselineResult = await this.mlClientService.calibrate(childId, value.events);

    const repo = this.dataSource.getRepository('ChildrenProfile');
    const existingProfile = await repo.findOne({ where: { user_id: childId } });

    if (existingProfile) {
      await repo.update(existingProfile.id, {
        baseline_json: baselineResult.baseline,
      });
    } else {
      await repo.save({
        user_id: childId,
        baseline_json: baselineResult.baseline,
      });
    }

    if (value.score > 0) {
      await this.dataSource.query(
        `
        INSERT INTO tokens (child_id, amount, type, reason)
        VALUES ($1, $2, 'EARN', $3)
        `,
        [childId, value.score, 'CALIBRATION_GAME'],
      );
    }

    logger.info('Calibration baseline persisted', {
      context: 'TrackingController',
      data: {
        childId,
        eventsCount: value.events.length,
        duration: value.duration,
        gameType: value.gameType,
        source: baselineResult.source,
        motorProfile: baselineResult.baseline?.motor_profile,
      },
    });

    return {
      child_id: childId,
      duration: value.duration,
      game_type: value.gameType,
      source: baselineResult.source,
      baseline: baselineResult.baseline,
    };
  }

  async issueSessionToken(body, req) {
    const userId = req?.user?.sub;
    const role = req?.user?.role;

    if (!userId) {
      throw new BadRequestException('Missing authenticated user');
    }

    if (!process.env.JWT_SECRET) {
      throw new InternalServerErrorException('JWT secret is not configured');
    }

    const sessionId = crypto.randomUUID();
    const contentId = body?.contentId || body?.content_id || null;
    const expiresIn = '2h';

    const trackingToken = jwt.sign(
      {
        user_id: userId,
        session_id: sessionId,
        role,
        ...(contentId ? { content_id: contentId } : {}),
      },
      process.env.JWT_SECRET,
      { expiresIn },
    );

    return {
      trackingToken,
      tracking_token: trackingToken,
      sessionId,
      session_id: sessionId,
      expiresIn,
      expires_in: expiresIn,
    };
  }
}

Controller('api/v1')(TrackingController);
Inject(MlClientService)(TrackingController, undefined, 0);
Inject(DataSource)(TrackingController, undefined, 1);

const calibrateDescriptor = Object.getOwnPropertyDescriptor(
  TrackingController.prototype,
  'calibrate',
);

Reflect.decorate(
  [
    Post('calibrate'),
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ROLE_CHILD', 'ROLE_GUARDIAN', 'ROLE_CLINICIAN'),
  ],
  TrackingController.prototype,
  'calibrate',
  calibrateDescriptor,
);
Body()(TrackingController.prototype, 'calibrate', 0);
Req()(TrackingController.prototype, 'calibrate', 1);

const issueSessionTokenDescriptor = Object.getOwnPropertyDescriptor(
  TrackingController.prototype,
  'issueSessionToken',
);

Reflect.decorate(
  [Post('tracking/session-token'), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_CHILD')],
  TrackingController.prototype,
  'issueSessionToken',
  issueSessionTokenDescriptor,
);
Body()(TrackingController.prototype, 'issueSessionToken', 0);
Req()(TrackingController.prototype, 'issueSessionToken', 1);

module.exports = { TrackingController };
