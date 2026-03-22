require('reflect-metadata');

const {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  Inject,
} = require('@nestjs/common');
const { DataSource } = require('typeorm');

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

module.exports = { TrackingController };
