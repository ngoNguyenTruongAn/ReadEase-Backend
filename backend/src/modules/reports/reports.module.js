/**
 * Reports Module
 *
 * Wires together the Reports feature:
 * - ReportsController (REST endpoints)
 * - ReportsService (data aggregation + persistence)
 * - GeminiService (AI report generation)
 * - TypeORM repositories for Report, ReadingSession, ReadingContent, User
 */

const { Module } = require('@nestjs/common');
const { TypeOrmModule } = require('@nestjs/typeorm');

const { ReportsController } = require('./reports.controller');
const { ReportsService } = require('./reports.service');
const { GeminiService } = require('./gemini.service');

const { ReportEntity } = require('./entities/report.entity');
const { ReadingSessionEntity } = require('../reading/entities/reading-session.entity');
const { ReadingContentEntity } = require('../reading/entities/reading-content.entity');
const { UserEntity } = require('../users/entities/user.entity');

class ReportsModule {}

Module({
  imports: [
    TypeOrmModule.forFeature([
      ReportEntity,
      ReadingSessionEntity,
      ReadingContentEntity,
      UserEntity,
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, GeminiService],
  exports: [ReportsService],
})(ReportsModule);

module.exports = { ReportsModule };
