require('reflect-metadata');

const {
  Controller,
  Post,
  Get,
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
const LinkChildDto = require('./dto/link-child.dto');

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

  async listChildren(req) {
    return this.guardianService.listChildren(req.user.sub);
  }

  async linkChild(body, req) {
    const { error, value } = LinkChildDto.schema.validate(body);
    if (error) {
      throw new BadRequestException(error.details[0].message);
    }
    return this.guardianService.linkChild(req.user.sub, value.inviteCode);
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

const listChildrenDescriptor = Object.getOwnPropertyDescriptor(
  GuardianController.prototype,
  'listChildren',
);
Reflect.decorate(
  [Get('children'), HttpCode(200), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_GUARDIAN')],
  GuardianController.prototype,
  'listChildren',
  listChildrenDescriptor,
);
Req()(GuardianController.prototype, 'listChildren', 0);

const linkChildDescriptor = Object.getOwnPropertyDescriptor(
  GuardianController.prototype,
  'linkChild',
);
Reflect.decorate(
  [Post('link-child'), HttpCode(200), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_GUARDIAN')],
  GuardianController.prototype,
  'linkChild',
  linkChildDescriptor,
);
Body()(GuardianController.prototype, 'linkChild', 0);
Req()(GuardianController.prototype, 'linkChild', 1);

module.exports = { GuardianController };
