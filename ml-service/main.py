"""
ReadEase ML Engine — Cognitive State Classifier
FastAPI microservice for mouse trajectory classification.

Endpoints:
  GET  /           → Health check
  POST /classify   → Classify cognitive state from kinematic features
  POST /calibrate  → Process 30s calibration game baseline
"""

from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional


app = FastAPI(
    title="ReadEase ML Engine",
    description="Cognitive state classifier for dyslexia reading support",
    version="0.1.0",
)


# ── Request / Response Models ──────────────────

class KinematicFeatures(BaseModel):
    """12 kinematic features extracted from mouse trajectory batch."""
    velocity_mean: float = 0.0
    velocity_std: float = 0.0
    acceleration_mean: float = 0.0
    acceleration_std: float = 0.0
    curvature_mean: float = 0.0
    curvature_std: float = 0.0
    dwell_time_mean: float = 0.0
    dwell_time_std: float = 0.0
    direction_changes: int = 0
    path_length: float = 0.0
    displacement: float = 0.0
    pause_count: int = 0


class ClassifyRequest(BaseModel):
    session_id: str
    features: KinematicFeatures


class ClassifyResponse(BaseModel):
    state: str  # FLUENT | REGRESSION | DISTRACTION
    confidence: float
    session_id: str


class CalibrateRequest(BaseModel):
    child_id: str
    calibration_data: List[dict]


class CalibrateResponse(BaseModel):
    child_id: str
    baseline_computed: bool
    message: str


# ── Endpoints ──────────────────────────────────

@app.get("/")
def health():
    return {
        "status": "ok",
        "service": "ReadEase ML Engine",
        "model_loaded": False,
        "version": "0.1.0",
    }


@app.post("/classify", response_model=ClassifyResponse)
def classify(request: ClassifyRequest):
    """
    Classify cognitive state based on kinematic features.
    TODO: Load trained model.joblib and predict.
    Currently returns threshold-based fallback.
    """
    velocity = request.features.velocity_mean

    if velocity < 50:
        state = "REGRESSION"
        confidence = 0.6
    elif velocity > 500:
        state = "DISTRACTION"
        confidence = 0.6
    else:
        state = "FLUENT"
        confidence = 0.7

    return ClassifyResponse(
        state=state,
        confidence=confidence,
        session_id=request.session_id,
    )


@app.post("/calibrate", response_model=CalibrateResponse)
def calibrate(request: CalibrateRequest):
    """
    Process 30-second calibration mini-game data to establish motor baseline.
    TODO: Compute per-child baseline from calibration mouse data.
    """
    return CalibrateResponse(
        child_id=request.child_id,
        baseline_computed=False,
        message="Calibration endpoint placeholder — model not yet trained.",
    )