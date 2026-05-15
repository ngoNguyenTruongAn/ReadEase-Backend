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

  validateParams(childId) {
    const { error: paramsError, value: paramsValue } = GuardianDataActionDto.paramsSchema.validate({
      childId,
    });
    if (paramsError) {
      throw new BadRequestException(paramsError.details[0].message);
    }

    return paramsValue.childId;
  }

  validateExportRequest(childId, body) {
    const validatedChildId = this.validateParams(childId);
    const { error: bodyError, value: bodyValue } =
      GuardianDataActionDto.exportBodySchema.validate(body);
    if (bodyError) {
      throw new BadRequestException(bodyError.details[0].message);
    }

    return {
      childId: validatedChildId,
      confirmationToken: bodyValue.confirmationToken,
    };
  }

  validateEraseRequest(childId, body) {
    const validatedChildId = this.validateParams(childId);
    const { error: bodyError, value: bodyValue } =
      GuardianDataActionDto.eraseBodySchema.validate(body);
    if (bodyError) {
      throw new BadRequestException(bodyError.details[0].message);
    }

    return {
      childId: validatedChildId,
      otpCode: bodyValue.otpCode,
    };
  }

  async exportChildData(childId, body, req) {
    const validated = this.validateExportRequest(childId, body);
    return this.guardianService.exportChildData(
      req.user.sub,
      validated.childId,
      validated.confirmationToken,
    );
  }

  async requestEraseOtp(childId, req) {
    const validatedChildId = this.validateParams(childId);
    return this.guardianService.requestEraseOtp(req.user.sub, validatedChildId);
  }

  async eraseChildData(childId, body, req) {
    const validated = this.validateEraseRequest(childId, body);
    return this.guardianService.eraseChildData(req.user.sub, validated.childId, validated.otpCode);
  }

  async listChildren(req) {
    return this.guardianService.listChildren(req.user.sub);
  }

  async listAllChildren(req) {
    return this.guardianService.listAllChildren(req.user);
  }

  async listMyGuardians(req) {
    return this.guardianService.listGuardiansForChild(req.user.sub);
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

const requestEraseOtpDescriptor = Object.getOwnPropertyDescriptor(
  GuardianController.prototype,
  'requestEraseOtp',
);
Reflect.decorate(
  [
    Post(':childId/erase/otp'),
    HttpCode(200),
    UseGuards(JwtAuthGuard, RolesGuard, GuardianThrottlerGuard),
    Roles('ROLE_GUARDIAN'),
    Throttle({ default: { limit: 1, ttl: 60000 } }),
  ],
  GuardianController.prototype,
  'requestEraseOtp',
  requestEraseOtpDescriptor,
);
Param('childId')(GuardianController.prototype, 'requestEraseOtp', 0);
Req()(GuardianController.prototype, 'requestEraseOtp', 1);

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

// ── GET /guardian/all-children (Protected: ROLE_CLINICIAN + ROLE_GUARDIAN) ──
// Clinician sees ALL children; Guardian sees only their linked children
const listAllChildrenDescriptor = Object.getOwnPropertyDescriptor(
  GuardianController.prototype,
  'listAllChildren',
);
Reflect.decorate(
  [
    Get('all-children'),
    HttpCode(200),
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ROLE_CLINICIAN', 'ROLE_GUARDIAN'),
  ],
  GuardianController.prototype,
  'listAllChildren',
  listAllChildrenDescriptor,
);
Req()(GuardianController.prototype, 'listAllChildren', 0);

const listMyGuardiansDescriptor = Object.getOwnPropertyDescriptor(
  GuardianController.prototype,
  'listMyGuardians',
);
Reflect.decorate(
  [
    Get('my-guardians'),
    HttpCode(200),
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ROLE_CHILD'),
  ],
  GuardianController.prototype,
  'listMyGuardians',
  listMyGuardiansDescriptor,
);
Req()(GuardianController.prototype, 'listMyGuardians', 0);

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
