require('reflect-metadata');

const { Module } = require('@nestjs/common');
const { TypeOrmModule } = require('@nestjs/typeorm');

const { ReadingContentEntity } = require('./entities/reading-content.entity');
const { ContentController } = require('./content.controller');
const { ContentService } = require('./content.service');
const { ContentRepository } = require('./content.repository');

class ReadingModule {}

Module({
  imports: [TypeOrmModule.forFeature([ReadingContentEntity])],
  controllers: [ContentController],
  providers: [ContentService, ContentRepository],
  exports: [ContentService, ContentRepository],
})(ReadingModule);

module.exports = { ReadingModule };
