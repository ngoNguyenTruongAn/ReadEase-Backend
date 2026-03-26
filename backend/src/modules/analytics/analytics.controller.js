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
const HeatmapQueryDto = require('./dto/heatmap-query.dto');

const { JwtAuthGuard } = require('../auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../auth/guards/roles.guard');
const { Roles } = require('../auth/decorators/roles.decorator');

class AnalyticsController {
  constructor(analyticsService) {
    this.analyticsService = analyticsService;
  }

  async getHeatmap(childId, query) {
    // Validate URL params
    const { error: paramError } = HeatmapQueryDto.paramsSchema.validate({ childId });
    if (paramError) {
      throw new BadRequestException(paramError.details[0].message);
    }

    // Validate query params
    const { error: queryError, value } = HeatmapQueryDto.querySchema.validate(query);
    if (queryError) {
      throw new BadRequestException(queryError.details[0].message);
    }

    return this.analyticsService.getHeatmap(childId, value.sessionId);
  }
}

Controller('api/v1/analytics')(AnalyticsController);
Inject(AnalyticsService)(AnalyticsController, undefined, 0);

const getHeatmapDescriptor = Object.getOwnPropertyDescriptor(
  AnalyticsController.prototype,
  'getHeatmap',
);

Reflect.decorate(
  [Get(':childId/heatmap'), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_CLINICIAN')],
  AnalyticsController.prototype,
  'getHeatmap',
  getHeatmapDescriptor,
);

Param('childId')(AnalyticsController.prototype, 'getHeatmap', 0);
Query()(AnalyticsController.prototype, 'getHeatmap', 1);

module.exports = { AnalyticsController };
