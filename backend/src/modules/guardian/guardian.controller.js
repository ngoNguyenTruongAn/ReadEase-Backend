require('reflect-metadata');

const {
  Controller,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  HttpCode,
  Inject,
} = require('@nestjs/common');
const { Throttle } = require('@nestjs/throttler');

const { GuardianService } = require('./guardian.service');
const GuardianDataActionDto = require('./dto/guardian-data-action.dto');

const { JwtAuthGuard } = require('../auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../auth/guards/roles.guard');
const { Roles } = require('../auth/decorators/roles.decorator');
const { GuardianThrottlerGuard } = require('./guards/guardian-throttler.guard');

class GuardianController {
  constructor(guardianService) {
    this.guardianService = guardianService;
  }

  validateRequest(childId, body) {
    const { error: paramsError, value: paramsValue } = GuardianDataActionDto.paramsSchema.validate({
      childId,
    });
    if (paramsError) {
      throw new BadRequestException(paramsError.details[0].message);
    }

    const { error: bodyError, value: bodyValue } = GuardianDataActionDto.bodySchema.validate(body);
    if (bodyError) {
      throw new BadRequestException(bodyError.details[0].message);
    }

    return {
      childId: paramsValue.childId,
      confirmationToken: bodyValue.confirmationToken,
    };
  }

  async exportChildData(childId, body, req) {
    const validated = this.validateRequest(childId, body);
    return this.guardianService.exportChildData(
      req.user.sub,
      validated.childId,
      validated.confirmationToken,
    );
  }

  async eraseChildData(childId, body, req) {
    const validated = this.validateRequest(childId, body);
    return this.guardianService.eraseChildData(
      req.user.sub,
      validated.childId,
      validated.confirmationToken,
    );
  }
}

Controller('api/v1/guardian')(GuardianController);
Inject(GuardianService)(GuardianController, undefined, 0);

const exportDescriptor = Object.getOwnPropertyDescriptor(
  GuardianController.prototype,
  'exportChildData',
);
Reflect.decorate(
  [
    Post(':childId/export'),
    HttpCode(200),
    UseGuards(JwtAuthGuard, RolesGuard, GuardianThrottlerGuard),
    Roles('ROLE_GUARDIAN'),
    Throttle({ default: { limit: 1, ttl: 60000 } }),
  ],
  GuardianController.prototype,
  'exportChildData',
  exportDescriptor,
);
Param('childId')(GuardianController.prototype, 'exportChildData', 0);
Body()(GuardianController.prototype, 'exportChildData', 1);
Req()(GuardianController.prototype, 'exportChildData', 2);

const eraseDescriptor = Object.getOwnPropertyDescriptor(
  GuardianController.prototype,
  'eraseChildData',
);
Reflect.decorate(
  [
    Delete(':childId/erase'),
    HttpCode(200),
    UseGuards(JwtAuthGuard, RolesGuard, GuardianThrottlerGuard),
    Roles('ROLE_GUARDIAN'),
    Throttle({ default: { limit: 1, ttl: 60000 } }),
  ],
  GuardianController.prototype,
  'eraseChildData',
  eraseDescriptor,
);
Param('childId')(GuardianController.prototype, 'eraseChildData', 0);
Body()(GuardianController.prototype, 'eraseChildData', 1);
Req()(GuardianController.prototype, 'eraseChildData', 2);

module.exports = { GuardianController };
