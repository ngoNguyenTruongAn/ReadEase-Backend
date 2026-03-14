"""
Feature Processor — Normalizes kinematic features using StandardScaler.

The scaler is fitted during training and saved alongside the model in
model.joblib. At inference time, raw features are scaled to match the
training distribution before being fed to the classifier.
"""

import numpy as np


# ── Feature names in the order expected by the model ───────
FEATURE_NAMES = [
    "velocity_mean",       # 1.  Average cursor speed
    "velocity_std",        # 2.  Speed variability
    "velocity_max",        # 3.  Peak speed
    "acceleration_mean",   # 4.  Average acceleration
    "acceleration_std",    # 5.  Acceleration variability
    "curvature_mean",      # 6.  Average path curvature
    "curvature_std",       # 7.  Curvature variability
    "dwell_time_mean",     # 8.  Average pause duration per word
    "dwell_time_max",      # 9.  Longest pause
    "direction_changes",   # 10. Number of direction reversals
    "regression_count",    # 11. Backward saccade count
    "path_efficiency",     # 12. Straight-line / actual path ratio
]


def features_to_array(features_dict: dict) -> np.ndarray:
    """
    Convert a dict of kinematic features into a numpy array
    in the correct order expected by the model.

    Args:
        features_dict: Dict with keys matching FEATURE_NAMES

    Returns:
        1D numpy array of shape (12,)
    """
    return np.array([features_dict.get(name, 0.0) for name in FEATURE_NAMES])


def normalize_features(features_array: np.ndarray, scaler) -> np.ndarray:
    """
    Apply StandardScaler transform to raw features.

    Args:
        features_array: 1D array of shape (12,)
        scaler: Fitted sklearn StandardScaler

    Returns:
        Scaled 1D array of shape (12,)
    """
    # reshape to 2D for sklearn (1 sample, 12 features)
    reshaped = features_array.reshape(1, -1)
    return scaler.transform(reshaped)
