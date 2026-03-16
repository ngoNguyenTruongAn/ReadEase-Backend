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
const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

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

      logger.info('ML classify success', {
        context: 'MlClientService',
        data: {
          sessionId,
          state: response.data.state,
          confidence: response.data.confidence,
        },
      });

      return {
        state: response.data.state,
        confidence: response.data.confidence,
        session_id: sessionId,
        source: 'ml_model',
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
   *   regression_count >= 3            → REGRESSION
   *   direction_changes >= 5 && eff<0.5 → DISTRACTION
   *   otherwise                        → FLUENT
   */
  fallbackClassify(sessionId, features) {
    let state = 'FLUENT';
    let confidence = 0.6;

    if (features.regression_count >= 3) {
      state = 'REGRESSION';
      confidence = 0.65;
    } else if (features.direction_changes >= 5 && features.path_efficiency < 0.5) {
      state = 'DISTRACTION';
      confidence = 0.6;
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
}

Injectable()(MlClientService);
Inject(HttpService)(MlClientService, undefined, 0);

module.exports = MlClientService;
