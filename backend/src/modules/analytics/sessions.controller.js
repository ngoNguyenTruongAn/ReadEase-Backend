require('reflect-metadata');

const {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  Inject,
} = require('@nestjs/common');

const { AnalyticsService } = require('./analytics.service');
const ReplayParamsDto = require('./dto/replay-params.dto');
const SessionListDto = require('./dto/session-list.dto');

const { JwtAuthGuard } = require('../auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../auth/guards/roles.guard');
const { Roles } = require('../auth/decorators/roles.decorator');

class SessionsController {
  constructor(analyticsService) {
    this.analyticsService = analyticsService;
  }

  async getReplay(sessionId) {
    const { error } = ReplayParamsDto.paramsSchema.validate({ sessionId });
    if (error) {
      throw new BadRequestException(error.details[0].message);
    }

    return this.analyticsService.getSessionReplay(sessionId);
  }

  async getChildSessions(childId, query) {
    const { error: paramError } = SessionListDto.paramsSchema.validate({ childId });
    if (paramError) {
      throw new BadRequestException(paramError.details[0].message);
    }

    const { error: queryError, value } = SessionListDto.querySchema.validate(query);
    if (queryError) {
      throw new BadRequestException(queryError.details[0].message);
    }

    return this.analyticsService.getChildSessions(childId, value.limit, value.offset, value.status);
  }
}

Controller('api/v1/sessions')(SessionsController);
Inject(AnalyticsService)(SessionsController, undefined, 0);

// ── getReplay: GET /api/v1/sessions/:sessionId/replay ──
const getReplayDescriptor = Object.getOwnPropertyDescriptor(
  SessionsController.prototype,
  'getReplay',
);

Reflect.decorate(
  [Get(':sessionId/replay'), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_CLINICIAN')],
  SessionsController.prototype,
  'getReplay',
  getReplayDescriptor,
);

Param('sessionId')(SessionsController.prototype, 'getReplay', 0);

// ── getChildSessions: GET /api/v1/sessions/:childId ──
const getChildSessionsDescriptor = Object.getOwnPropertyDescriptor(
  SessionsController.prototype,
  'getChildSessions',
);

Reflect.decorate(
  [Get(':childId'), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_CLINICIAN')],
  SessionsController.prototype,
  'getChildSessions',
  getChildSessionsDescriptor,
);

Param('childId')(SessionsController.prototype, 'getChildSessions', 0);
Query()(SessionsController.prototype, 'getChildSessions', 1);

module.exports = { SessionsController };
