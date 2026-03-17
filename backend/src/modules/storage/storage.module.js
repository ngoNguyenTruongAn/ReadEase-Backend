/**
 * Storage Module
 *
 * Provides Supabase Storage integration via StorageService.
 * Exports StorageService for use in other modules.
 */

require('reflect-metadata');

const { Module } = require('@nestjs/common');
const { StorageService } = require('./storage.service');
const { UploadController } = require('./upload.controller');

class StorageModule {}

Module({
  controllers: [UploadController],
  providers: [StorageService],
  exports: [StorageService],
})(StorageModule);

module.exports = { StorageModule };
