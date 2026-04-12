require('reflect-metadata');

const { Module } = require('@nestjs/common');
const { TypeOrmModule } = require('@nestjs/typeorm');

const { ReadingContentEntity } = require('./entities/reading-content.entity');
const { ContentController } = require('./content.controller');
const { ContentService } = require('./content.service');
const { ContentRepository } = require('./content.repository');
const { SegmentationAdapter } = require('./segmentation.adapter');
const { StorageModule } = require('../storage/storage.module');

class ReadingModule {}

Module({
  imports: [TypeOrmModule.forFeature([ReadingContentEntity]), StorageModule],
  controllers: [ContentController],
  providers: [ContentService, ContentRepository, SegmentationAdapter],
  exports: [ContentService, ContentRepository],
})(ReadingModule);

module.exports = { ReadingModule };
