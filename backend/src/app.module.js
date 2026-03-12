const { Module } = require('@nestjs/common');
const { APP_INTERCEPTOR, APP_GUARD } = require('@nestjs/core');
const { ConfigModule, ConfigService } = require('@nestjs/config');
const { TypeOrmModule } = require('@nestjs/typeorm');
const { ThrottlerModule, ThrottlerGuard } = require('@nestjs/throttler');
const { AppController } = require('./app.controller');
const { AppService } = require('./app.service');
const { configModules, validationSchema, validationOptions } = require('./config');
const { LoggingInterceptor } = require('./common/interceptors/logging.interceptor');
const { requestIdMiddleware } = require('./common/middleware/request-id.middleware');
const { HealthModule } = require('./modules/health/health.module');
const {TrackingModule} = require('./modules/tracking/tracking.module');
// ── Entity imports ──
const { UserEntity } = require('./modules/users/entities/user.entity');
const { ChildrenProfileEntity } = require('./modules/users/entities/children-profile.entity');
const { ReadingContentEntity } = require('./modules/reading/entities/reading-content.entity');
const { ReadingSessionEntity } = require('./modules/reading/entities/reading-session.entity');
const { MouseEventEntity } = require('./modules/tracking/entities/mouse-event.entity');
const {
  SessionReplayEventEntity,
} = require('./modules/tracking/entities/session-replay-event.entity');
const { TokenEntity } = require('./modules/gamification/entities/token.entity');
const { RewardEntity } = require('./modules/gamification/entities/reward.entity');
const { RedemptionEntity } = require('./modules/gamification/entities/redemption.entity');
const { ReportEntity } = require('./modules/reports/entities/report.entity');
const { AuthModule } = require('./modules/auth/auth.module');

const entities = [
  UserEntity,
  ChildrenProfileEntity,
  ReadingContentEntity,
  ReadingSessionEntity,
  MouseEventEntity,
  SessionReplayEventEntity,
  TokenEntity,
  RewardEntity,
  RedemptionEntity,
  ReportEntity,
];

/** @type {import('@nestjs/common').ModuleMetadata} */
const metadata = {
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configModules,
      validationSchema,
      validationOptions,
      envFilePath: ['.env', '../.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.name'),
        entities,
        synchronize: false, // NEVER true in production — use migrations
        logging: configService.get('app.env') === 'development',
      }),
    }),
    HealthModule,
    AuthModule,
    TrackingModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
};

class AppModule {
  /**
   * Apply request-id middleware to all routes
   * @param {MiddlewareConsumer} consumer
   */
  configure(consumer) {
    consumer.apply(requestIdMiddleware).forRoutes('*');
  }
}

Reflect.decorate([Module(metadata)], AppModule);

module.exports = { AppModule };
