require('reflect-metadata');

const { Controller, Get, UseGuards, Inject } = require('@nestjs/common');

const { ClinicianService } = require('./clinician.service');
const { JwtAuthGuard } = require('../auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../auth/guards/roles.guard');
const { Roles } = require('../auth/decorators/roles.decorator');

class ClinicianController {
  constructor(clinicianService) {
    this.clinicianService = clinicianService;
  }

  async getDashboard() {
    return this.clinicianService.getDashboard();
  }
}

Controller('api/v1/clinician')(ClinicianController);
Inject(ClinicianService)(ClinicianController, undefined, 0);

const getDashboardDescriptor = Object.getOwnPropertyDescriptor(
  ClinicianController.prototype,
  'getDashboard',
);

Reflect.decorate(
  [Get('dashboard'), UseGuards(JwtAuthGuard, RolesGuard), Roles('ROLE_CLINICIAN')],
  ClinicianController.prototype,
  'getDashboard',
  getDashboardDescriptor,
);

module.exports = { ClinicianController };
