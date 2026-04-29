require('reflect-metadata');

const {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Body,
  Param,
  Req,
  UseGuards,
  BadRequestException,
  Inject,
} = require('@nestjs/common');

const { ContentService } = require('./content.service');
const CreateContentDto = require('./dto/create-content.dto');
const UpdateContentDto = require('./dto/update-content.dto');
const QueryContentDto = require('./dto/query-content.dto');

const { JwtAuthGuard } = require('../auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../auth/guards/roles.guard');
const { Roles } = require('../auth/decorators/roles.decorator');

// Standard UUID format validation (8-4-4-4-12 hex chars)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertUuid(id, field = 'id') {
  if (!UUID_REGEX.test(id)) throw new BadRequestException(`${field} must be a valid UUID`);
}

class ContentController {
  constructor(contentService) {
    this.contentService = contentService;
  }

  async getContent(query) {
    const { error, value } = QueryContentDto.schema.validate(query);

    if (error) {
      throw new BadRequestException(error.details[0].message);
    }

    return this.contentService.getContent(value);
  }

  async createContent(body, req) {
    const { error, value } = CreateContentDto.schema.validate(body);

    if (error) {
      throw new BadRequestException(error.details[0].message);
    }

    return {
      message: 'Created reading content successfully',
      data: await this.contentService.createContent(value, req.user),
    };
  }

  async getContentById(id) {
    assertUuid(id, 'id');
    return this.contentService.getContentById(id);
  }

  async updateContent(id, body) {
    assertUuid(id, 'id');
    const { error, value } = UpdateContentDto.schema.validate(body);

    if (error) {
      throw new BadRequestException(error.details[0].message);
    }

    return {
      message: 'Updated reading content successfully',
      data: await this.contentService.updateContent(id, value),
    };
  }

  async deleteContent(id) {
    assertUuid(id, 'id');
    return this.contentService.deleteContent(id);
  }
}

Controller('api/v1/content')(ContentController);
Inject(ContentService)(ContentController, undefined, 0);

const getContentDescriptor = Object.getOwnPropertyDescriptor(
  ContentController.prototype,
  'getContent',
);
Reflect.decorate(
  [
    Get(),
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ROLE_CHILD', 'ROLE_CLINICIAN', 'ROLE_GUARDIAN'),
  ],
  ContentController.prototype,
  'getContent',
  getContentDescriptor,
);
Query()(ContentController.prototype, 'getContent', 0);

const getContentByIdDescriptor = Object.getOwnPropertyDescriptor(
  ContentController.prototype,
  'getContentById',
);
Reflect.decorate(
  [
    Get(':id'),
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ROLE_CHILD', 'ROLE_CLINICIAN', 'ROLE_GUARDIAN'),
  ],
  ContentController.prototype,
  'getContentById',
  getContentByIdDescriptor,
);
Param('id')(ContentController.prototype, 'getContentById', 0);

const createContentDescriptor = Object.getOwnPropertyDescriptor(
  ContentController.prototype,
  'createContent',
);
Reflect.decorate(
  [Post(), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_CLINICIAN')],
  ContentController.prototype,
  'createContent',
  createContentDescriptor,
);
Body()(ContentController.prototype, 'createContent', 0);
Req()(ContentController.prototype, 'createContent', 1);

const updateContentDescriptor = Object.getOwnPropertyDescriptor(
  ContentController.prototype,
  'updateContent',
);
Reflect.decorate(
  [Put(':id'), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_CLINICIAN')],
  ContentController.prototype,
  'updateContent',
  updateContentDescriptor,
);
Param('id')(ContentController.prototype, 'updateContent', 0);
Body()(ContentController.prototype, 'updateContent', 1);

const deleteContentDescriptor = Object.getOwnPropertyDescriptor(
  ContentController.prototype,
  'deleteContent',
);
Reflect.decorate(
  [Delete(':id'), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_CLINICIAN')],
  ContentController.prototype,
  'deleteContent',
  deleteContentDescriptor,
);
Param('id')(ContentController.prototype, 'deleteContent', 0);

module.exports = { ContentController };
