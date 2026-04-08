/**
 * Segmentation Adapter
 *
 * HTTP client that calls the ML service /segment endpoint
 * to perform Vietnamese word segmentation using underthesea.
 *
 * Features:
 *   - Configurable timeout (SEGMENTATION_TIMEOUT_MS, default 5000ms)
 *   - Single retry on failure
 *   - Graceful fallback: returns normalized input on any error
 */

const { Injectable } = require('@nestjs/common');
const axios = require('axios');
const { logger } = require('../../common/logger/winston.config');

class SegmentationAdapter {
  constructor() {
    this.baseUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';
    this.timeout = parseInt(process.env.SEGMENTATION_TIMEOUT_MS, 10) || 5000;
  }

  /**
   * Normalize whitespace and newlines deterministically.
   *
   * @param {string} text - Raw input text
   * @returns {string} Normalized text
   */
  normalizeText(text) {
    if (!text || !text.trim()) {
      return '';
    }

    return String(text)
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Segment Vietnamese text via ML service.
   *
   * On success: returns segmented string with underscore-joined compounds.
   * On failure: returns the normalized raw text (graceful fallback).
   *
   * @param {string} text - Vietnamese text to segment
   * @returns {Promise<string>} Segmented text
   */
  async segment(text) {
    const normalized = this.normalizeText(text);

    if (!normalized) {
      return '';
    }

    try {
      // Attempt with 1 retry
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await axios.post(
            `${this.baseUrl}/segment`,
            { text: normalized },
            { timeout: this.timeout },
          );

          if (response.data && typeof response.data.segmented === 'string') {
            logger.info('Segmentation success', {
              context: 'SegmentationAdapter',
              data: { length: normalized.length, attempt },
            });
            return response.data.segmented;
          }

          logger.warn('Segmentation response missing segmented field', {
            context: 'SegmentationAdapter',
            data: { attempt, responseKeys: Object.keys(response.data || {}) },
          });
        } catch (error) {
          const isLastAttempt = attempt === 2;
          const level = isLastAttempt ? 'warn' : 'debug';

          logger[level]('Segmentation request failed', {
            context: 'SegmentationAdapter',
            data: {
              attempt,
              error: error.message || String(error),
              code: error.code || 'UNKNOWN',
              willRetry: !isLastAttempt,
            },
          });

          if (!isLastAttempt) {
            // Brief wait before retry
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }
      }
    } catch (outerError) {
      logger.warn('Segmentation unexpected error', {
        context: 'SegmentationAdapter',
        data: { error: outerError.message || String(outerError) },
      });
    }

    // Fallback: return normalized text without segmentation
    logger.warn('Segmentation fallback — using normalized raw text', {
      context: 'SegmentationAdapter',
      data: { length: normalized.length },
    });

    return normalized;
  }
}

Injectable()(SegmentationAdapter);

module.exports = { SegmentationAdapter };
