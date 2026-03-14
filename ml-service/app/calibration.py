"""
Calibration — Process 30-second mini-game data to compute motor baseline.

Each child plays a 30s calibration game before reading. This module
computes their baseline motor profile (velocity, reaction time, accuracy)
so the classifier can normalize predictions per-child.

See: .claude/skills/ml-classifier-pipeline/references/calibration-design.md
"""

import numpy as np
from datetime import datetime, timezone


def compute_baseline(events: list) -> dict:
    """
    Compute per-child motor baseline from calibration game mouse data.

    Args:
        events: List of {'x': float, 'y': float, 'timestamp': float}
                sorted by timestamp (milliseconds)

    Returns:
        Dict with baseline metrics for normalizing ML predictions
    """
    if len(events) < 10:
        raise ValueError("Need at least 10 events for calibration")

    # ── Compute velocities ─────────────────────────────────
    velocities = []
    for i in range(1, len(events)):
        dx = events[i]["x"] - events[i - 1]["x"]
        dy = events[i]["y"] - events[i - 1]["y"]
        dt = (events[i]["timestamp"] - events[i - 1]["timestamp"]) or 1  # avoid division by 0

        velocity = np.sqrt(dx**2 + dy**2) / dt
        velocities.append(velocity)

    vel_mean = float(np.mean(velocities))
    vel_std = float(np.std(velocities))

    # ── Compute reaction times (gaps > 200ms = pauses) ─────
    reaction_times = []
    for i in range(1, len(events)):
        gap = events[i]["timestamp"] - events[i - 1]["timestamp"]
        if gap > 200:  # 200ms threshold for "reaction" pause
            reaction_times.append(gap)

    reaction_mean = float(np.mean(reaction_times)) if reaction_times else 0.0

    # ── Compute click accuracy (path smoothness as proxy) ──
    # Higher path_efficiency = smoother movement = higher accuracy
    total_path = 0.0
    for i in range(1, len(events)):
        dx = events[i]["x"] - events[i - 1]["x"]
        dy = events[i]["y"] - events[i - 1]["y"]
        total_path += np.sqrt(dx**2 + dy**2)

    straight_line = np.sqrt(
        (events[-1]["x"] - events[0]["x"])**2 +
        (events[-1]["y"] - events[0]["y"])**2
    )

    accuracy_score = round(straight_line / total_path, 4) if total_path > 0 else 0.0
    # Clamp to [0, 1]
    accuracy_score = min(max(accuracy_score, 0.0), 1.0)

    # ── Classify motor profile ─────────────────────────────
    if vel_mean < 80:
        motor_profile = "SLOW"
    elif vel_mean > 300:
        motor_profile = "FAST"
    else:
        motor_profile = "NORMAL"

    return {
        "velocity_baseline": round(vel_mean, 2),
        "velocity_range": [
            round(vel_mean - 2 * vel_std, 2),
            round(vel_mean + 2 * vel_std, 2),
        ],
        "reaction_time_mean": round(reaction_mean, 2),
        "accuracy_score": accuracy_score,
        "motor_profile": motor_profile,
        "calibrated_at": datetime.now(timezone.utc).isoformat(),
    }
