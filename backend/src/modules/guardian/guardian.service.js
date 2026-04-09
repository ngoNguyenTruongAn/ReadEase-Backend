const {
  Injectable,
  Inject,
  ForbiddenException,
  UnauthorizedException,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { InjectDataSource } = require('@nestjs/typeorm');
const { logger } = require('../../common/logger/winston.config');

class GuardianService {
  constructor(dataSource, configService) {
    this.dataSource = dataSource;
    this.configService = configService;
  }

  async listChildren(guardianId) {
    const rows = await this.dataSource.query(
      `
      SELECT c.id, c.email, c.display_name, c.is_active, c.created_at,
             gc.consent_given_at, gc.consent_type,
             cp.date_of_birth, cp.grade_level
      FROM users c
      JOIN guardian_children gc ON c.id = gc.child_id
      LEFT JOIN children_profiles cp ON c.id = cp.user_id
      WHERE gc.guardian_id = $1
      ORDER BY gc.consent_given_at DESC
      `,
      [guardianId],
    );

    return rows;
  }

  async linkChild(guardianId, inviteCode) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const childRows = await queryRunner.manager.query(
        `
        SELECT id, guardian_invite_code_expires_at, is_active
        FROM users
        WHERE guardian_invite_code = $1
          AND role = 'ROLE_CHILD'
        FOR UPDATE
        `,
        [inviteCode],
      );

      if (childRows.length === 0) {
        throw new NotFoundException('Invalid invite code or child not found');
      }

      const child = childRows[0];

      if (child.is_active) {
        throw new ConflictException('This child account is already active');
      }

      if (
        child.guardian_invite_code_expires_at &&
        new Date() > new Date(child.guardian_invite_code_expires_at)
      ) {
        throw new BadRequestException('Invite code has expired');
      }

      const existingLink = await queryRunner.manager.query(
        `
        SELECT 1 FROM guardian_children 
        WHERE guardian_id = $1 AND child_id = $2
        `,
        [guardianId, child.id],
      );

      if (existingLink.length > 0) {
        throw new ConflictException('You are already linked to this child');
      }

      await queryRunner.manager.query(
        `
        INSERT INTO guardian_children (guardian_id, child_id, consent_given_at, consent_type)
        VALUES ($1, $2, NOW(), 'COPPA_PARENTAL')
        `,
        [guardianId, child.id],
      );

      await queryRunner.manager.query(
        `
        UPDATE users 
        SET is_active = true, 
            guardian_invite_code = NULL, 
            guardian_invite_code_expires_at = NULL
        WHERE id = $1
        `,
        [child.id],
      );

      await queryRunner.commitTransaction();

      logger.info('Guardian linked child', {
        context: 'GuardianService',
        data: { guardianId, childId: child.id },
      });

      return {
        message: 'Child linked successfully and account activated',
        childId: child.id,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  getExpectedConfirmationToken(action) {
    if (action === 'export') {
      return this.configService.get(
        'GUARDIAN_EXPORT_CONFIRMATION_TOKEN',
        'CONFIRM_EXPORT_CHILD_DATA',
      );
    }

    return this.configService.get('GUARDIAN_ERASE_CONFIRMATION_TOKEN', 'CONFIRM_ERASE_CHILD_DATA');
  }

  verifyConfirmationToken(action, confirmationToken) {
    const expectedToken = this.getExpectedConfirmationToken(action);

    if (confirmationToken !== expectedToken) {
      throw new UnauthorizedException('Invalid confirmation token');
    }
  }

  async verifyGuardianship(executor, guardianId, childId) {
    const rows = await executor.query(
      `
      SELECT guardian_id, child_id, consent_given_at, consent_type
      FROM guardian_children
      WHERE guardian_id = $1
        AND child_id = $2
      LIMIT 1
      `,
      [guardianId, childId],
    );

    if (rows.length === 0) {
      throw new ForbiddenException('You do not have access to this child');
    }

    return rows[0];
  }

  async exportChildData(guardianId, childId, confirmationToken) {
    this.verifyConfirmationToken('export', confirmationToken);
    const guardianship = await this.verifyGuardianship(this.dataSource, guardianId, childId);

    const childRows = await this.dataSource.query(
      `
      SELECT id, email, display_name, role, email_verified, is_active,
             last_login_at, created_at, updated_at, deleted_at
      FROM users
      WHERE id = $1
        AND role = 'ROLE_CHILD'
      LIMIT 1
      `,
      [childId],
    );

    if (childRows.length === 0) {
      throw new ForbiddenException('You do not have access to this child');
    }

    const profileRows = await this.dataSource.query(
      `
      SELECT id, user_id, date_of_birth, grade_level, baseline_json, preferences, created_at, updated_at
      FROM children_profiles
      WHERE user_id = $1
      LIMIT 1
      `,
      [childId],
    );

    const sessions = await this.dataSource.query(
      `
      SELECT id, user_id, content_id, status, started_at, ended_at,
             effort_score, cognitive_state_summary, settings, created_at
      FROM reading_sessions
      WHERE user_id = $1
      ORDER BY started_at DESC
      `,
      [childId],
    );

    const mouseEvents = await this.dataSource.query(
      `
      SELECT me.id, me.session_id, me.x, me.y, me.timestamp, me.word_index,
             me.velocity, me.acceleration, me.curvature, me.dwell_time, me.created_at
      FROM mouse_events me
      WHERE me.session_id IN (
        SELECT id
        FROM reading_sessions
        WHERE user_id = $1
      )
      ORDER BY me.session_id, me.timestamp
      `,
      [childId],
    );

    const sessionReplayEvents = await this.dataSource.query(
      `
      SELECT sre.id, sre.session_id, sre.event_type, sre.payload, sre.cognitive_state,
             sre.intervention_type, sre.timestamp, sre.created_at
      FROM session_replay_events sre
      WHERE sre.session_id IN (
        SELECT id
        FROM reading_sessions
        WHERE user_id = $1
      )
      ORDER BY sre.session_id, sre.timestamp
      `,
      [childId],
    );

    const tokens = await this.dataSource.query(
      `
      SELECT id, child_id, amount, type, reason, effort_score, session_id, created_at
      FROM tokens
      WHERE child_id = $1
      ORDER BY created_at DESC
      `,
      [childId],
    );

    const redemptions = await this.dataSource.query(
      `
      SELECT id, child_id, reward_id, cost, redeemed_at
      FROM redemptions
      WHERE child_id = $1
      ORDER BY redeemed_at DESC
      `,
      [childId],
    );

    const reports = await this.dataSource.query(
      `
      SELECT id, child_id, report_type, content, ai_model, ai_disclaimer,
             period_start, period_end, created_at
      FROM reports
      WHERE child_id = $1
      ORDER BY created_at DESC
      `,
      [childId],
    );

    const otpCodes = await this.dataSource.query(
      `
      SELECT id, user_id, code, type, used, expires_at, created_at
      FROM otp_codes
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [childId],
    );

    logger.info('Guardian exported child data', {
      context: 'GuardianService',
      data: { guardianId, childId },
    });

    return {
      exportedAt: new Date().toISOString(),
      childId,
      exportedByGuardianId: guardianId,
      child: childRows[0],
      guardianship,
      profile: profileRows[0] || null,
      readingSessions: sessions,
      mouseEvents,
      sessionReplayEvents,
      tokens,
      redemptions,
      reports,
      otpCodes,
    };
  }

  async getCount(executor, sql, params) {
    const rows = await executor.query(sql, params);
    return Number(rows[0]?.count || 0);
  }

  async collectChildDataCounts(executor, childId) {
    const users = await this.getCount(
      executor,
      `
      SELECT COUNT(*)::int AS count
      FROM users
      WHERE id = $1
      `,
      [childId],
    );

    const children_profiles = await this.getCount(
      executor,
      `
      SELECT COUNT(*)::int AS count
      FROM children_profiles
      WHERE user_id = $1
      `,
      [childId],
    );

    const guardian_children = await this.getCount(
      executor,
      `
      SELECT COUNT(*)::int AS count
      FROM guardian_children
      WHERE child_id = $1
      `,
      [childId],
    );

    const reading_sessions = await this.getCount(
      executor,
      `
      SELECT COUNT(*)::int AS count
      FROM reading_sessions
      WHERE user_id = $1
      `,
      [childId],
    );

    const mouse_events = await this.getCount(
      executor,
      `
      SELECT COUNT(*)::int AS count
      FROM mouse_events
      WHERE session_id IN (
        SELECT id
        FROM reading_sessions
        WHERE user_id = $1
      )
      `,
      [childId],
    );

    const session_replay_events = await this.getCount(
      executor,
      `
      SELECT COUNT(*)::int AS count
      FROM session_replay_events
      WHERE session_id IN (
        SELECT id
        FROM reading_sessions
        WHERE user_id = $1
      )
      `,
      [childId],
    );

    const tokens = await this.getCount(
      executor,
      `
      SELECT COUNT(*)::int AS count
      FROM tokens
      WHERE child_id = $1
      `,
      [childId],
    );

    const redemptions = await this.getCount(
      executor,
      `
      SELECT COUNT(*)::int AS count
      FROM redemptions
      WHERE child_id = $1
      `,
      [childId],
    );

    const reports = await this.getCount(
      executor,
      `
      SELECT COUNT(*)::int AS count
      FROM reports
      WHERE child_id = $1
      `,
      [childId],
    );

    const otp_codes = await this.getCount(
      executor,
      `
      SELECT COUNT(*)::int AS count
      FROM otp_codes
      WHERE user_id = $1
      `,
      [childId],
    );

    return {
      users,
      children_profiles,
      guardian_children,
      reading_sessions,
      mouse_events,
      session_replay_events,
      tokens,
      redemptions,
      reports,
      otp_codes,
    };
  }

  assertZeroResidualCounts(counts) {
    const remaining = Object.entries(counts).filter(([, count]) => Number(count) > 0);

    if (remaining.length > 0) {
      throw new InternalServerErrorException('Child data erasure incomplete');
    }
  }

  async eraseChildData(guardianId, childId, confirmationToken) {
    this.verifyConfirmationToken('erase', confirmationToken);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.verifyGuardianship(queryRunner.manager, guardianId, childId);

      const deletedCounts = await this.collectChildDataCounts(queryRunner.manager, childId);

      await queryRunner.manager.query(
        `
        DELETE FROM otp_codes
        WHERE user_id = $1
        `,
        [childId],
      );

      await queryRunner.manager.query(
        `
        DELETE FROM reading_sessions
        WHERE user_id = $1
        `,
        [childId],
      );

      await queryRunner.manager.query(
        `
        DELETE FROM tokens
        WHERE child_id = $1
        `,
        [childId],
      );

      await queryRunner.manager.query(
        `
        DELETE FROM redemptions
        WHERE child_id = $1
        `,
        [childId],
      );

      await queryRunner.manager.query(
        `
        DELETE FROM reports
        WHERE child_id = $1
        `,
        [childId],
      );

      await queryRunner.manager.query(
        `
        DELETE FROM guardian_children
        WHERE child_id = $1
        `,
        [childId],
      );

      await queryRunner.manager.query(
        `
        DELETE FROM children_profiles
        WHERE user_id = $1
        `,
        [childId],
      );

      await queryRunner.manager.query(
        `
        DELETE FROM users
        WHERE id = $1
        `,
        [childId],
      );

      const postEraseCounts = await this.collectChildDataCounts(queryRunner.manager, childId);
      this.assertZeroResidualCounts(postEraseCounts);

      await queryRunner.commitTransaction();

      logger.info('Guardian erased child data', {
        context: 'GuardianService',
        data: { guardianId, childId },
      });

      return {
        erased: true,
        childId,
        erasedAt: new Date().toISOString(),
        deletedCounts,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}

InjectDataSource()(GuardianService, undefined, 0);
Inject(ConfigService)(GuardianService, undefined, 1);
Injectable()(GuardianService);

module.exports = { GuardianService };
