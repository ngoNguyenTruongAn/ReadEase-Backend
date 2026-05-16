/**
 * ML Client Service
 *
 * Calls Python ML Engine POST /classify with 12 kinematic features.
 * Includes timeout handling and threshold-based fallback when ML service
 * is unavailable.
 */

const { Injectable, Inject } = require('@nestjs/common');
const { HttpService } = require('@nestjs/axios');
const { logger } = require('../../../common/logger/winston.config');
const { extractFeatures } = require('../utils/feature-extractor');

const ML_TIMEOUT = parseInt(process.env.ML_CLASSIFY_TIMEOUT || '3000', 10);
const ML_URL = process.env.ML_SERVICE_URL || process.env.ML_ENGINE_URL || 'http://ml-engine:8000';

function isErraticDistraction(features) {
  const directionChanges = Number(features?.direction_changes || 0);
  const pathEfficiency = Number(features?.path_efficiency ?? 1);
  const dwellTimeMax = Number(features?.dwell_time_max || 0);

  return (
    (directionChanges >= 4 && pathEfficiency < 0.2 && dwellTimeMax < 150) ||
    (directionChanges >= 4 && pathEfficiency < 0.1)
  );
}

class MlClientService {
  constructor(httpService) {
    this.httpService = httpService;
    this.classifyUrl = `${ML_URL}/classify`;
  }

  /**
   * Classify cognitive state from mouse points.
   * Extracts features → calls ML → returns result.
   * Falls back to threshold if ML is unavailable.
   *
   * @param {string} sessionId
   * @param {Array<{x: number, y: number, timestamp: number}>} points
   * @returns {Promise<{state: string, confidence: number, session_id: string, source: string}>}
   */
  async classify(sessionId, points) {
    const features = extractFeatures(points);

    try {
      const response = await this.httpService.axiosRef.post(
        this.classifyUrl,
        {
          session_id: sessionId,
          features,
        },
        {
          timeout: ML_TIMEOUT,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const state = isErraticDistraction(features) ? 'DISTRACTION' : response.data.state;
      const source =
        state !== response.data.state ? 'ml_model_erratic_override' : 'ml_model';

      logger.info('ML classify success', {
        context: 'MlClientService',
        data: {
          sessionId,
          modelState: response.data.state,
          finalState: state,
          confidence: response.data.confidence,
          source,
        },
      });

      return {
        state,
        confidence: response.data.confidence,
        session_id: sessionId,
        source,
      };
    } catch (err) {
      logger.warn('ML classify failed, using fallback', {
        context: 'MlClientService',
        data: {
          sessionId,
          error: err.message,
          code: err.code || 'UNKNOWN',
        },
      });

      return this.fallbackClassify(sessionId, features);
    }
  }

  /**
   * Threshold-based fallback classifier.
   * Used when ML service is unavailable or times out.
   *
   * Rules:
   *   erratic low-efficiency movement    → DISTRACTION
   *   regression_count >= 3            → REGRESSION
   *   otherwise                        → FLUENT
   */
  fallbackClassify(sessionId, features) {
    let state = 'FLUENT';
    let confidence = 0.6;

    if (isErraticDistraction(features)) {
      state = 'DISTRACTION';
      confidence = 0.65;
    } else if (features.regression_count >= 3) {
      state = 'REGRESSION';
      confidence = 0.65;
    }

    logger.info('Fallback classify result', {
      context: 'MlClientService',
      data: { sessionId, state, confidence },
    });

    return {
      state,
      confidence,
      session_id: sessionId,
      source: 'fallback_threshold',
    };
  }

  /**
   * Call Python ML /calibrate to compute motor baseline.
   *
   * @param {string} childId
   * @param {Array<{x: number, y: number, timestamp: number}>} events - min 10
   * @returns {Promise<{child_id: string, baseline: object, source: string}>}
   */
  async calibrate(childId, events) {
    const calibrateUrl = `${ML_URL}/calibrate`;

    try {
      const response = await this.httpService.axiosRef.post(
        calibrateUrl,
        { child_id: childId, events },
        { timeout: ML_TIMEOUT * 2, headers: { 'Content-Type': 'application/json' } },
      );

      logger.info('ML calibrate success', {
        context: 'MlClientService',
        data: {
          childId,
          motorProfile: response.data.baseline?.motor_profile,
        },
      });

      return {
        child_id: childId,
        baseline: response.data.baseline,
        source: 'ml_model',
      };
    } catch (err) {
      logger.warn('ML calibrate failed, using fallback baseline', {
        context: 'MlClientService',
        data: { childId, error: err.message },
      });

      return this.fallbackCalibrate(childId, events);
    }
  }

  /**
   * Fallback baseline when ML /calibrate is unavailable.
   */
  fallbackCalibrate(childId, events) {
    if (!events || events.length < 3) {
      return {
        child_id: childId,
        baseline: {
          motor_profile: 'NORMAL',
          velocity_baseline: 0,
          calibrated_at: new Date().toISOString(),
        },
        source: 'fallback_default',
      };
    }

    // Calculate basic velocity from events
    let totalVelocity = 0;
    let count = 0;
    for (let i = 1; i < events.length; i++) {
      const dx = (events[i].x || 0) - (events[i - 1].x || 0);
      const dy = (events[i].y || 0) - (events[i - 1].y || 0);
      const dt = (events[i].timestamp || 0) - (events[i - 1].timestamp || 0);
      if (dt > 0) {
        totalVelocity += Math.sqrt(dx * dx + dy * dy) / dt;
        count++;
      }
    }

    const avgVelocity = count > 0 ? totalVelocity / count : 0;
    let motorProfile = 'NORMAL';
    if (avgVelocity < 0.3) motorProfile = 'SLOW';
    else if (avgVelocity > 1.0) motorProfile = 'FAST';

    return {
      child_id: childId,
      baseline: {
        velocity_baseline: parseFloat(avgVelocity.toFixed(4)),
        velocity_range: [0, parseFloat((avgVelocity * 2).toFixed(4))],
        motor_profile: motorProfile,
        calibrated_at: new Date().toISOString(),
      },
      source: 'fallback_calculated',
    };
  }
}

Injectable()(MlClientService);
Inject(HttpService)(MlClientService, undefined, 0);

module.exports = MlClientService;
