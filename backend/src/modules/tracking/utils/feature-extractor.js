/**
 * Feature Extractor
 *
 * Extracts 12 kinematic features from raw mouse points [{x, y, timestamp}]
 * for ML cognitive state classification.
 *
 * Features:
 *   Velocity:      velocity_mean, velocity_std, velocity_max
 *   Acceleration:  acceleration_mean, acceleration_std
 *   Curvature:     curvature_mean, curvature_std
 *   Dwell time:    dwell_time_mean, dwell_time_max
 *   Behavioral:    direction_changes, regression_count, path_efficiency
 */

/**
 * Calculate distance between two points
 */
function distance(p1, p2) {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

/**
 * Calculate mean of an array
 */
function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Calculate standard deviation of an array
 */
function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Extract 12 kinematic features from mouse points
 * @param {Array<{x: number, y: number, timestamp: number}>} points
 * @returns {object} 12 kinematic features matching ML schema
 */
function extractFeatures(points) {
  const defaults = {
    velocity_mean: 0,
    velocity_std: 0,
    velocity_max: 0,
    acceleration_mean: 0,
    acceleration_std: 0,
    curvature_mean: 0,
    curvature_std: 0,
    dwell_time_mean: 0,
    dwell_time_max: 0,
    direction_changes: 0,
    regression_count: 0,
    path_efficiency: 1.0,
  };

  if (!points || points.length < 3) {
    return defaults;
  }

  // Sort by timestamp
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);

  // ── Velocities (px/ms) ──
  const velocities = [];
  for (let i = 1; i < sorted.length; i++) {
    const dt = sorted[i].timestamp - sorted[i - 1].timestamp;
    if (dt > 0) {
      velocities.push(distance(sorted[i - 1], sorted[i]) / dt);
    }
  }

  // ── Accelerations (px/ms²) ──
  const accelerations = [];
  for (let i = 1; i < velocities.length; i++) {
    const dt = sorted[i + 1].timestamp - sorted[i].timestamp;
    if (dt > 0) {
      accelerations.push(Math.abs(velocities[i] - velocities[i - 1]) / dt);
    }
  }

  // ── Curvature (angle changes in radians) ──
  const curvatures = [];
  for (let i = 1; i < sorted.length - 1; i++) {
    const dx1 = sorted[i].x - sorted[i - 1].x;
    const dy1 = sorted[i].y - sorted[i - 1].y;
    const dx2 = sorted[i + 1].x - sorted[i].x;
    const dy2 = sorted[i + 1].y - sorted[i].y;

    const angle1 = Math.atan2(dy1, dx1);
    const angle2 = Math.atan2(dy2, dx2);

    let diff = Math.abs(angle2 - angle1);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    curvatures.push(diff);
  }

  // ── Dwell times (pauses where velocity ≈ 0) ──
  const DWELL_THRESHOLD = 0.05; // px/ms — slow enough to be a pause
  const dwellTimes = [];
  let dwellStart = null;

  for (let i = 0; i < velocities.length; i++) {
    if (velocities[i] < DWELL_THRESHOLD) {
      if (dwellStart === null) dwellStart = sorted[i].timestamp;
    } else {
      if (dwellStart !== null) {
        dwellTimes.push(sorted[i].timestamp - dwellStart);
        dwellStart = null;
      }
    }
  }
  if (dwellStart !== null) {
    dwellTimes.push(sorted[sorted.length - 1].timestamp - dwellStart);
  }

  // ── Direction changes (horizontal reversals) ──
  let directionChanges = 0;
  for (let i = 2; i < sorted.length; i++) {
    const dx1 = sorted[i - 1].x - sorted[i - 2].x;
    const dx2 = sorted[i].x - sorted[i - 1].x;
    if ((dx1 > 0 && dx2 < 0) || (dx1 < 0 && dx2 > 0)) {
      directionChanges++;
    }
  }

  // ── Regression count (backward horizontal saccades) ──
  let regressionCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    // Moving right-to-left = regression (for LTR reading)
    if (sorted[i].x < sorted[i - 1].x - 10) {
      regressionCount++;
    }
  }

  // ── Path efficiency (straight-line / actual path ratio) ──
  let actualPath = 0;
  for (let i = 1; i < sorted.length; i++) {
    actualPath += distance(sorted[i - 1], sorted[i]);
  }
  const straightLine = distance(sorted[0], sorted[sorted.length - 1]);
  const pathEfficiency = actualPath > 0 ? Math.min(straightLine / actualPath, 1.0) : 1.0;

  return {
    velocity_mean: Number(mean(velocities).toFixed(4)),
    velocity_std: Number(std(velocities).toFixed(4)),
    velocity_max: velocities.length ? Number(Math.max(...velocities).toFixed(4)) : 0,
    acceleration_mean: Number(mean(accelerations).toFixed(4)),
    acceleration_std: Number(std(accelerations).toFixed(4)),
    curvature_mean: Number(mean(curvatures).toFixed(4)),
    curvature_std: Number(std(curvatures).toFixed(4)),
    dwell_time_mean: Number(mean(dwellTimes).toFixed(2)),
    dwell_time_max: dwellTimes.length ? Number(Math.max(...dwellTimes).toFixed(2)) : 0,
    direction_changes: directionChanges,
    regression_count: regressionCount,
    path_efficiency: Number(pathEfficiency.toFixed(4)),
  };
}

module.exports = { extractFeatures };
