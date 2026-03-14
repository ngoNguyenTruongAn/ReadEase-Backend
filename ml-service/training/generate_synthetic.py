"""
Synthetic Training Data Generator
==================================
Generates 3000 samples (1000 per class) with realistic kinematic feature
distributions for FLUENT, REGRESSION, and DISTRACTION states.

Uses numpy random distributions calibrated to match each cognitive state's
expected mouse behavior (from training-guide.md).

Usage:
    python generate_synthetic.py
    → Outputs training_data.csv in the same directory
"""

import numpy as np
import pandas as pd
import os

# Random seed for reproducibility
np.random.seed(42)

# Number of samples per class
SAMPLES_PER_CLASS = 1000

# Feature column names (same order as feature_processor.py)
COLUMNS = [
    "velocity_mean",
    "velocity_std",
    "velocity_max",
    "acceleration_mean",
    "acceleration_std",
    "curvature_mean",
    "curvature_std",
    "dwell_time_mean",
    "dwell_time_max",
    "direction_changes",
    "regression_count",
    "path_efficiency",
    "label",
]


def generate_fluent(n: int) -> list:
    """
    FLUENT state: smooth, left-to-right reading.
    Characteristics:
      - Moderate, consistent velocity (150-250 px/ms)
      - Low velocity variance
      - Few direction changes (0-5)
      - Zero or very few regressions (0-2)
      - Short dwell times (50-200 ms)
      - High path efficiency (0.7-1.0)
    """
    samples = []
    for _ in range(n):
        vel_mean = np.random.normal(200, 30)          # ~200 px/ms average
        vel_std = np.random.normal(20, 8)              # Low variance
        vel_max = vel_mean + np.random.normal(100, 20) # Peak not too far from mean
        acc_mean = np.random.normal(5, 3)              # Gentle acceleration
        acc_std = np.random.normal(3, 1.5)
        curv_mean = np.random.normal(0.05, 0.02)       # Nearly straight paths
        curv_std = np.random.normal(0.02, 0.01)
        dwell_mean = np.random.normal(120, 30)         # Short pauses
        dwell_max = dwell_mean + np.random.normal(80, 20)
        dir_changes = int(np.random.poisson(2))        # Very few reversals
        regression_count = int(np.random.poisson(0.5)) # Almost no regressions
        path_eff = np.random.beta(8, 2)                # High efficiency (0.7-1.0)

        samples.append([
            max(vel_mean, 10), max(vel_std, 1), max(vel_max, 20),
            acc_mean, max(acc_std, 0.1),
            max(curv_mean, 0), max(curv_std, 0),
            max(dwell_mean, 10), max(dwell_max, 20),
            max(dir_changes, 0), max(regression_count, 0),
            np.clip(path_eff, 0, 1),
            "FLUENT",
        ])
    return samples


def generate_regression(n: int) -> list:
    """
    REGRESSION state: re-reading difficulty.
    Characteristics:
      - Lower velocity (50-150 px/ms) — slower reading
      - Higher dwell times (200-600 ms) — lingering on words
      - More regressions (3-15) — going backward
      - More direction changes (5-15)
      - Lower path efficiency (0.3-0.6)
      - Higher curvature (back-and-forth)
    """
    samples = []
    for _ in range(n):
        vel_mean = np.random.normal(100, 25)           # Slower reading
        vel_std = np.random.normal(40, 10)             # More variable
        vel_max = vel_mean + np.random.normal(120, 30)
        acc_mean = np.random.normal(8, 4)
        acc_std = np.random.normal(6, 3)
        curv_mean = np.random.normal(0.15, 0.05)       # More curved (re-reading)
        curv_std = np.random.normal(0.08, 0.03)
        dwell_mean = np.random.normal(350, 80)         # Long pauses on words
        dwell_max = dwell_mean + np.random.normal(200, 50)
        dir_changes = int(np.random.poisson(8))        # Frequent reversals
        regression_count = int(np.random.poisson(7))   # Key indicator: regressions
        path_eff = np.random.beta(3, 5)                # Low-mid efficiency

        samples.append([
            max(vel_mean, 10), max(vel_std, 1), max(vel_max, 20),
            acc_mean, max(acc_std, 0.1),
            max(curv_mean, 0), max(curv_std, 0),
            max(dwell_mean, 50), max(dwell_max, 100),
            max(dir_changes, 1), max(regression_count, 1),
            np.clip(path_eff, 0, 1),
            "REGRESSION",
        ])
    return samples


def generate_distraction(n: int) -> list:
    """
    DISTRACTION state: off-task, random cursor movement.
    Characteristics:
      - Very high velocity spikes (300-800 px/ms)
      - Very high velocity variance
      - Many direction changes (15-40)
      - Very low path efficiency (0.05-0.3)
      - Random dwell times
      - No word-following pattern (low regression, random movement)
    """
    samples = []
    for _ in range(n):
        vel_mean = np.random.normal(450, 100)          # Fast, erratic
        vel_std = np.random.normal(120, 30)            # Highly variable
        vel_max = vel_mean + np.random.normal(300, 80) # Big spikes
        acc_mean = np.random.normal(25, 10)            # Sharp accelerations
        acc_std = np.random.normal(15, 5)
        curv_mean = np.random.normal(0.3, 0.1)        # Curved, random paths
        curv_std = np.random.normal(0.15, 0.05)
        dwell_mean = np.random.normal(50, 30)          # Quick, not reading
        dwell_max = dwell_mean + np.random.normal(100, 40)
        dir_changes = int(np.random.poisson(25))       # Many reversals
        regression_count = int(np.random.poisson(1))   # Low — not reading at all
        path_eff = np.random.beta(1, 8)                # Very low efficiency

        samples.append([
            max(vel_mean, 50), max(vel_std, 10), max(vel_max, 100),
            acc_mean, max(acc_std, 0.1),
            max(curv_mean, 0), max(curv_std, 0),
            max(dwell_mean, 5), max(dwell_max, 10),
            max(dir_changes, 5), max(regression_count, 0),
            np.clip(path_eff, 0, 1),
            "DISTRACTION",
        ])
    return samples


def main():
    """Generate synthetic data and save to CSV."""
    print(f"Generating {SAMPLES_PER_CLASS * 3} synthetic samples...")

    # Generate all classes
    data = []
    data.extend(generate_fluent(SAMPLES_PER_CLASS))
    data.extend(generate_regression(SAMPLES_PER_CLASS))
    data.extend(generate_distraction(SAMPLES_PER_CLASS))

    # Create DataFrame
    df = pd.DataFrame(data, columns=COLUMNS)

    # Shuffle rows
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)

    # Save to CSV
    output_path = os.path.join(os.path.dirname(__file__), "training_data.csv")
    df.to_csv(output_path, index=False)

    print(f"✓ Saved {len(df)} samples to {output_path}")
    print(f"  Class distribution:")
    print(df["label"].value_counts().to_string())
    print(f"\n  Feature statistics:")
    print(df.describe().round(2).to_string())


if __name__ == "__main__":
    main()
