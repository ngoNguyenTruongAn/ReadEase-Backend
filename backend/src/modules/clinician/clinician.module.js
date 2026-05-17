const { Module } = require('@nestjs/common');

const { ClinicianController } = require('./clinician.controller');
const { ClinicianService } = require('./clinician.service');

class ClinicianModule {}

Module({
  controllers: [ClinicianController],
  providers: [ClinicianService],
})(ClinicianModule);

module.exports = { ClinicianModule };
