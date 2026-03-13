"""
Cognitive State Classifier — loads trained model and predicts states.

States:
  - FLUENT:      Normal reading flow → no intervention
  - REGRESSION:  Re-reading difficulty → visual + semantic intervention
  - DISTRACTION: Off-task cursor movement → visual-only intervention

The model (RandomForest + StandardScaler) is loaded from app/models/model.joblib
at startup. If the model file is missing, fallback to threshold-based rules.
"""

import os
import logging
import numpy as np
import joblib

from .feature_processor import features_to_array, normalize_features, FEATURE_NAMES

logger = logging.getLogger("ml-engine")

# ── State labels ───────────────────────────────────────────
STATES = ["FLUENT", "REGRESSION", "DISTRACTION"]

# ── Model path ─────────────────────────────────────────────
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "model.joblib")

# ── Global model + scaler (loaded once at startup) ─────────
_model = None
_scaler = None
_model_loaded = False


def load_model():
    """
    Load the trained model + scaler from model.joblib.
    Called once at FastAPI startup.
    Sets global _model, _scaler, _model_loaded flags.
    """
    global _model, _scaler, _model_loaded

    if not os.path.exists(MODEL_PATH):
        logger.warning(f"Model file not found: {MODEL_PATH} — using fallback")
        _model_loaded = False
        return False

    try:
        # model.joblib contains {'model': clf, 'scaler': scaler}
        bundle = joblib.load(MODEL_PATH)
        _model = bundle["model"]
        _scaler = bundle["scaler"]
        _model_loaded = True
        logger.info(f"Model loaded from {MODEL_PATH}")
        return True
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        _model_loaded = False
        return False


def is_model_loaded() -> bool:
    """Check if the trained model is available."""
    return _model_loaded


def predict(features_dict: dict) -> dict:
    """
    Predict cognitive state from kinematic features.

    Args:
        features_dict: Dict with 12 kinematic feature values

    Returns:
        dict with 'state', 'confidence', 'model_version'
    """
    if not _model_loaded:
        return fallback_predict(features_dict)

    # Convert dict → numpy array in correct feature order
    features_array = features_to_array(features_dict)

    # Normalize using the fitted scaler from training
    scaled = normalize_features(features_array, _scaler)

    # Predict class + probability
    predicted_class = _model.predict(scaled)[0]
    probabilities = _model.predict_proba(scaled)[0]

    # Get confidence = max probability
    confidence = float(max(probabilities))

    return {
        "state": predicted_class,
        "confidence": round(confidence, 4),
        "model_version": "1.0.0",
    }


def fallback_predict(features_dict: dict) -> dict:
    """
    Threshold-based fallback when trained model is unavailable.
    Uses simple rules from training-guide.md patterns.

    Args:
        features_dict: Dict with kinematic features

    Returns:
        dict with 'state', 'confidence', 'model_version'
    """
    velocity = features_dict.get("velocity_mean", 0)
    regressions = features_dict.get("regression_count", 0)
    direction_changes = features_dict.get("direction_changes", 0)
    path_eff = features_dict.get("path_efficiency", 1.0)

    # Rule 1: High regressions → REGRESSION
    if regressions > 5:
        return {"state": "REGRESSION", "confidence": 0.55, "model_version": "fallback"}

    # Rule 2: Many direction changes + low path efficiency → DISTRACTION
    if direction_changes > 15 and path_eff < 0.3:
        return {"state": "DISTRACTION", "confidence": 0.55, "model_version": "fallback"}

    # Rule 3: Very high velocity → DISTRACTION
    if velocity > 500:
        return {"state": "DISTRACTION", "confidence": 0.50, "model_version": "fallback"}

    # Rule 4: Very low velocity + some regressions → REGRESSION
    if velocity < 50 and regressions > 2:
        return {"state": "REGRESSION", "confidence": 0.50, "model_version": "fallback"}

    # Default: FLUENT
    return {"state": "FLUENT", "confidence": 0.60, "model_version": "fallback"}
