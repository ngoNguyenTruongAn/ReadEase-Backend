/**
 * Storage Module
 *
 * Provides S3 storage integration via StorageService, with Supabase fallback.
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
