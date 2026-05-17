const { Injectable } = require('@nestjs/common');
const { InjectRepository } = require('@nestjs/typeorm');

const { MouseEventEntity } = require('../entities/mouse-event.entity');
const { logger } = require('../../../common/logger/winston.config');

const DWELL_VELOCITY_THRESHOLD = 0.05;
const BATCH_SIZE = 500;

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampSmallInt(value) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(-32768, Math.min(32767, parsed));
}

function getWordIndex(event) {
  const parsed = Number(event?.word_index ?? event?.wordIndex);
  return Number.isInteger(parsed) ? parsed : null;
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angleBetween(previousVector, currentVector) {
  if (!previousVector || !currentVector) return null;

  const previousMagnitude = Math.hypot(previousVector.x, previousVector.y);
  const currentMagnitude = Math.hypot(currentVector.x, currentVector.y);

  if (previousMagnitude === 0 || currentMagnitude === 0) {
    return 0;
  }

  const cosine =
    (previousVector.x * currentVector.x + previousVector.y * currentVector.y) /
    (previousMagnitude * currentMagnitude);

  return Math.acos(Math.max(-1, Math.min(1, cosine)));
}

class MouseEventStorageService {
  constructor(repository) {
    this.repository = repository;
    this.sessionState = new Map();
  }

  normalizeMouseEvents(events) {
    return events
      .filter((event) => event?.type === 'mouse_move')
      .map((event) => ({
        x: clampSmallInt(event.x),
        y: clampSmallInt(event.y),
        timestamp: toFiniteNumber(event.timestamp),
        word_index: getWordIndex(event),
      }))
      .filter((event) => event.x !== null && event.y !== null && event.timestamp !== null)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  buildRows(sessionId, events) {
    const rows = [];
    const state = this.sessionState.get(sessionId) || {
      previousPoint: null,
      previousVector: null,
      previousVelocity: null,
      dwellTime: 0,
    };

    for (const event of events) {
      let velocity = null;
      let acceleration = null;
      let curvature = null;
      let dwellTime = 0;

      if (state.previousPoint) {
        const dt = event.timestamp - state.previousPoint.timestamp;

        if (dt > 0) {
          const currentDistance = distance(state.previousPoint, event);
          const currentVector = {
            x: event.x - state.previousPoint.x,
            y: event.y - state.previousPoint.y,
          };

          velocity = currentDistance / dt;

          if (state.previousVelocity !== null) {
            acceleration = Math.abs(velocity - state.previousVelocity) / dt;
          }

          curvature = angleBetween(state.previousVector, currentVector);

          if (velocity < DWELL_VELOCITY_THRESHOLD) {
            dwellTime = state.dwellTime + dt;
          }

          state.previousVector = currentVector;
          state.previousVelocity = velocity;
          state.dwellTime = dwellTime;
        }
      }

      rows.push({
        session_id: sessionId,
        x: event.x,
        y: event.y,
        timestamp: event.timestamp,
        word_index: event.word_index,
        velocity,
        acceleration,
        curvature,
        dwell_time: dwellTime,
        created_at: new Date(),
      });

      state.previousPoint = event;
    }

    this.sessionState.set(sessionId, state);

    return rows;
  }

  async storeEvents(sessionId, events) {
    if (!sessionId || !Array.isArray(events) || events.length === 0) {
      return;
    }

    const mouseEvents = this.normalizeMouseEvents(events);
    if (mouseEvents.length === 0) {
      return;
    }

    const rows = this.buildRows(sessionId, mouseEvents);

    try {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        await this.repository.insert(rows.slice(i, i + BATCH_SIZE));
      }
    } catch (err) {
      logger.error('mouse_events insert failed', {
        context: 'MouseEventStorageService',
        data: {
          sessionId,
          error: err.message,
        },
      });
    }
  }

  clearSession(sessionId) {
    if (!sessionId) return;
    this.sessionState.delete(sessionId);
  }
}

Injectable()(MouseEventStorageService);

InjectRepository(MouseEventEntity)(MouseEventStorageService, undefined, 0);

module.exports = MouseEventStorageService;
