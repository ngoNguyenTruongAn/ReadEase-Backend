const {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} = require('@nestjs/common');
const { InjectDataSource } = require('@nestjs/typeorm');

class TokenService {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  clampEffortScore(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    if (numeric < 0) return 0;
    if (numeric > 1) return 1;
    return Number(numeric.toFixed(4));
  }

  computeEffortFromSummary(summary) {
    if (!summary || typeof summary !== 'object') {
      return 0;
    }

    if (summary.effort_score !== undefined && summary.effort_score !== null) {
      return this.clampEffortScore(summary.effort_score);
    }

    const stateCounts = summary.state_counts || {};
    const fluent = Number(stateCounts.FLUENT || 0);
    const regression = Number(stateCounts.REGRESSION || 0);
    const distraction = Number(stateCounts.DISTRACTION || 0);
    const total = fluent + regression + distraction;

    if (total <= 0) {
      return 0;
    }

    const weighted = fluent * 1 + regression * 0.75 + distraction * 0.2;
    return this.clampEffortScore(weighted / total);
  }

  calculateStreakBonus(streakCount) {
    if (!streakCount || streakCount < 3) {
      return 0;
    }

    return streakCount % 3 === 0 ? 20 : 0;
  }

  async getHighEffortStreak(manager, childId) {
    const sessions = await manager.query(
      `
      SELECT effort_score
      FROM reading_sessions
      WHERE user_id = $1
        AND status = 'COMPLETED'
        AND ended_at IS NOT NULL
      ORDER BY ended_at DESC
      LIMIT 30
      `,
      [childId],
    );

    let streak = 0;
    for (const session of sessions) {
      const effort = Number(session.effort_score || 0);
      if (effort > 0.7) {
        streak += 1;
      } else {
        break;
      }
    }

    return streak;
  }

  async earnFromSession(childId, sessionId) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existing = await queryRunner.manager.query(
        `
        SELECT id, amount, type, effort_score, created_at
        FROM tokens
        WHERE session_id = $1
          AND type IN ('EARN', 'BONUS')
        `,
        [sessionId],
      );

      if (existing.length > 0) {
        await queryRunner.commitTransaction();
        return {
          childId,
          sessionId,
          baseTokens: existing
            .filter((row) => row.type === 'EARN')
            .reduce((sum, row) => sum + Number(row.amount), 0),
          bonusTokens: existing
            .filter((row) => row.type === 'BONUS')
            .reduce((sum, row) => sum + Number(row.amount), 0),
          effortScore: this.clampEffortScore(existing[0].effort_score),
          idempotent: true,
        };
      }

      const sessions = await queryRunner.manager.query(
        `
        SELECT id, user_id, effort_score, cognitive_state_summary
        FROM reading_sessions
        WHERE id = $1
        LIMIT 1
        `,
        [sessionId],
      );

      if (sessions.length === 0) {
        throw new NotFoundException(`Session ${sessionId} not found`);
      }

      const session = sessions[0];
      if (session.user_id !== childId) {
        throw new BadRequestException('Session does not belong to requested child');
      }

      const summary = session.cognitive_state_summary || {};
      const effortScore = this.clampEffortScore(
        session.effort_score !== null && session.effort_score !== undefined
          ? session.effort_score
          : this.computeEffortFromSummary(summary),
      );

      const baseTokens = Math.floor(effortScore * 100);

      await queryRunner.manager.query(
        `
        INSERT INTO tokens (child_id, amount, type, reason, effort_score, session_id)
        VALUES ($1, $2, 'EARN', $3, $4, $5)
        `,
        [childId, baseTokens, 'EFFORT_SESSION_EARN', effortScore, sessionId],
      );

      let streakCount = 0;
      let bonusTokens = 0;

      if (effortScore > 0.7) {
        streakCount = await this.getHighEffortStreak(queryRunner.manager, childId);
        bonusTokens = this.calculateStreakBonus(streakCount);

        if (bonusTokens > 0) {
          await queryRunner.manager.query(
            `
            INSERT INTO tokens (child_id, amount, type, reason, effort_score, session_id)
            VALUES ($1, $2, 'BONUS', $3, $4, $5)
            `,
            [childId, bonusTokens, `STREAK_BONUS_${streakCount}`, effortScore, sessionId],
          );
        }
      }

      await queryRunner.commitTransaction();

      return {
        childId,
        sessionId,
        effortScore,
        baseTokens,
        bonusTokens,
        streakCount,
        idempotent: false,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getBalance(childId) {
    const rows = await this.dataSource.query(
      `
      SELECT COALESCE(SUM(amount), 0)::int AS balance
      FROM tokens
      WHERE child_id = $1
      `,
      [childId],
    );

    return {
      childId,
      balance: Number(rows[0]?.balance || 0),
    };
  }

  async getHistory(childId, limit, offset) {
    const historyRows = await this.dataSource.query(
      `
      SELECT id, child_id, amount, type, reason, effort_score, session_id, created_at
      FROM tokens
      WHERE child_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [childId, limit, offset],
    );

    const countRows = await this.dataSource.query(
      `
      SELECT COUNT(*)::int AS total
      FROM tokens
      WHERE child_id = $1
      `,
      [childId],
    );

    return {
      data: historyRows,
      meta: {
        limit,
        offset,
        total: Number(countRows[0]?.total || 0),
      },
    };
  }

  async listActiveRewards() {
    return this.dataSource.query(
      `
      SELECT id, name, description, cost, image_url, is_active, version, stock, created_at
      FROM rewards
      WHERE is_active = true
      ORDER BY cost ASC, created_at DESC
      `,
    );
  }

  async createReward(dto) {
    const rows = await this.dataSource.query(
      `
      INSERT INTO rewards (name, description, cost, image_url, is_active, stock)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, description, cost, image_url, is_active, version, stock, created_at
      `,
      [
        dto.name,
        dto.description || null,
        dto.cost,
        dto.image_url || null,
        dto.is_active !== undefined ? dto.is_active : true,
        dto.stock !== undefined ? dto.stock : null,
      ],
    );

    return rows[0];
  }

  async updateReward(rewardId, dto) {
    const existing = await this.dataSource.query(`SELECT id FROM rewards WHERE id = $1`, [
      rewardId,
    ]);

    if (existing.length === 0) {
      throw new NotFoundException('Reward not found');
    }

    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    const fields = ['name', 'description', 'cost', 'image_url', 'is_active', 'stock'];
    for (const field of fields) {
      if (dto[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        params.push(dto[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      throw new BadRequestException('No fields to update');
    }

    params.push(rewardId);
    const rows = await this.dataSource.query(
      `
      UPDATE rewards
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, description, cost, image_url, is_active, version, stock, created_at
      `,
      params,
    );

    return rows[0];
  }

  async deleteReward(rewardId) {
    const result = await this.dataSource.query(`DELETE FROM rewards WHERE id = $1 RETURNING id`, [
      rewardId,
    ]);

    if (result.length === 0) {
      throw new NotFoundException('Reward not found');
    }

    return { message: 'Reward deleted successfully' };
  }

  async redeemReward(childId, rewardId, expectedVersion) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const rewardRows = await queryRunner.manager.query(
        `
        SELECT id, name, cost, version, stock, is_active
        FROM rewards
        WHERE id = $1
        FOR UPDATE
        `,
        [rewardId],
      );

      if (rewardRows.length === 0) {
        throw new NotFoundException('Reward not found');
      }

      const reward = rewardRows[0];
      const rewardCost = Number(reward.cost);

      if (!reward.is_active) {
        throw new BadRequestException('Reward is inactive');
      }

      if (!Number.isFinite(rewardCost)) {
        throw new BadRequestException('Reward cost is invalid');
      }

      const stockValue = reward.stock === null ? null : Number(reward.stock);
      if (stockValue !== null && (!Number.isFinite(stockValue) || stockValue <= 0)) {
        throw new ConflictException('Reward version conflict or reward is out of stock');
      }

      const currentVersion = Number(reward.version);
      if (!Number.isFinite(currentVersion) || currentVersion !== Number(expectedVersion)) {
        throw new ConflictException('Reward version conflict or reward is out of stock');
      }

      const versionUpdateRows = await queryRunner.manager.query(
        `
        UPDATE rewards
        SET version = version + 1,
            stock = CASE WHEN stock IS NULL THEN NULL ELSE stock - 1 END
        WHERE id = $1
          AND version = $2
          AND is_active = true
          AND (stock IS NULL OR stock > 0)
        RETURNING version, stock
        `,
        [rewardId, expectedVersion],
      );

      if (versionUpdateRows.length === 0) {
        throw new ConflictException('Reward version conflict or reward is out of stock');
      }

      await queryRunner.manager.query(
        `
        SELECT id
        FROM tokens
        WHERE child_id = $1
        FOR UPDATE
        `,
        [childId],
      );

      const balanceRows = await queryRunner.manager.query(
        `
        SELECT COALESCE(SUM(amount), 0)::int AS balance
        FROM tokens
        WHERE child_id = $1
        `,
        [childId],
      );

      const currentBalance = Number(balanceRows[0]?.balance || 0);

      if (!Number.isFinite(currentBalance)) {
        throw new BadRequestException('Current balance is invalid');
      }

      if (currentBalance < rewardCost) {
        throw new BadRequestException('Insufficient tokens');
      }

      const redemptionRows = await queryRunner.manager.query(
        `
        INSERT INTO redemptions (child_id, reward_id, cost)
        VALUES ($1, $2, $3)
        RETURNING id, child_id, reward_id, cost, redeemed_at
        `,
        [childId, rewardId, rewardCost],
      );

      await queryRunner.manager.query(
        `
        INSERT INTO tokens (child_id, amount, type, reason, session_id)
        VALUES ($1, $2, 'SPEND', $3, NULL)
        `,
        [childId, -rewardCost, `REWARD_REDEEM_${rewardId}`],
      );

      await queryRunner.commitTransaction();

      return {
        redemption: redemptionRows[0],
        reward: {
          id: reward.id,
          name: reward.name,
          cost: rewardCost,
          version: Number(versionUpdateRows[0].version),
          stock: versionUpdateRows[0].stock === null ? null : Number(versionUpdateRows[0].stock),
        },
        balanceAfter: currentBalance - rewardCost,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get child's reward collection (all redeemed rewards grouped by type)
   */
  async getCollection(childId) {
    const rows = await this.dataSource.query(
      `
      SELECT
        r.id           AS reward_id,
        r.name,
        r.description,
        r.image_url,
        r.cost,
        COUNT(*)::int  AS quantity,
        MIN(rd.redeemed_at) AS first_redeemed_at,
        MAX(rd.redeemed_at) AS last_redeemed_at
      FROM redemptions rd
      JOIN rewards r ON r.id = rd.reward_id
      WHERE rd.child_id = $1
      GROUP BY r.id, r.name, r.description, r.image_url, r.cost
      ORDER BY MAX(rd.redeemed_at) DESC
      `,
      [childId],
    );

    return {
      childId,
      totalItems: rows.reduce((sum, row) => sum + Number(row.quantity), 0),
      uniqueItems: rows.length,
      items: rows,
    };
  }

  async setChildAvatar(childId, rewardId) {
    const childRows = await this.dataSource.query(
      `
      SELECT id, role
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [childId],
    );

    if (childRows.length === 0) {
      throw new NotFoundException('Child not found');
    }

    if (childRows[0].role !== 'ROLE_CHILD') {
      throw new ForbiddenException('Only child accounts can set an avatar');
    }

    const rewardRows = await this.dataSource.query(
      `
      SELECT r.id, r.name, r.image_url
      FROM redemptions rd
      JOIN rewards r ON r.id = rd.reward_id
      WHERE rd.child_id = $1
        AND rd.reward_id = $2
      ORDER BY rd.redeemed_at DESC
      LIMIT 1
      `,
      [childId, rewardId],
    );

    if (rewardRows.length === 0) {
      throw new ForbiddenException('Avatar reward must be in the child collection');
    }

    await this.dataSource.query(
      `
      INSERT INTO children_profiles (user_id, preferences, current_avatar_reward_id)
      VALUES ($1, '{}'::jsonb, $2)
      ON CONFLICT (user_id)
      DO UPDATE SET
        current_avatar_reward_id = EXCLUDED.current_avatar_reward_id,
        updated_at = NOW()
      `,
      [childId, rewardId],
    );

    const reward = rewardRows[0];

    return {
      childId,
      avatar_reward_id: reward.id,
      avatar_url: reward.image_url || null,
      avatar_name: reward.name || null,
    };
  }
}

Injectable()(TokenService);
InjectDataSource()(TokenService, undefined, 0);

module.exports = { TokenService };
