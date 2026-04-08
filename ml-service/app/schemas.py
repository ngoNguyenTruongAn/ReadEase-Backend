"""
Pydantic schemas for ML Engine request/response models.

Defines the 12 kinematic features extracted from mouse cursor trajectories,
plus request/response shapes for /classify and /calibrate endpoints.
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


# ── Kinematic Features ─────────────────────────────────────
# 12 features extracted from a batch of mouse events
# These match the feature set defined in ml-classifier-pipeline SKILL.md

class KinematicFeatures(BaseModel):
    """12 kinematic features from mouse trajectory batch."""

    # Velocity features (pixels/ms)
    velocity_mean: float = Field(0.0, description="Average cursor speed")
    velocity_std: float = Field(0.0, description="Speed variability")
    velocity_max: float = Field(0.0, description="Peak speed")

    # Acceleration features (pixels/ms²)
    acceleration_mean: float = Field(0.0, description="Average acceleration")
    acceleration_std: float = Field(0.0, description="Acceleration variability")

    # Curvature features (radians)
    curvature_mean: float = Field(0.0, description="Average path curvature")
    curvature_std: float = Field(0.0, description="Curvature variability")

    # Dwell time features (ms)
    dwell_time_mean: float = Field(0.0, description="Average pause duration per word")
    dwell_time_max: float = Field(0.0, description="Longest pause on a word")

    # Behavioral features
    direction_changes: int = Field(0, description="Number of horizontal direction reversals")
    regression_count: int = Field(0, description="Backward saccade count (re-reads)")
    path_efficiency: float = Field(1.0, description="Straight-line / actual path ratio (0-1)")


# ── Classify ───────────────────────────────────────────────

class ClassifyRequest(BaseModel):
    """Request body for POST /classify."""
    session_id: str = Field(..., description="Reading session UUID")
    features: KinematicFeatures


class ClassifyResponse(BaseModel):
    """Response body for POST /classify."""
    state: str = Field(..., description="FLUENT | REGRESSION | DISTRACTION")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Prediction confidence")
    session_id: str
    model_version: str = Field("1.0.0", description="Model version used for prediction")


# ── Calibrate ──────────────────────────────────────────────

class MouseEvent(BaseModel):
    """Single mouse event from calibration game."""
    x: float
    y: float
    timestamp: float = Field(..., description="Unix timestamp in milliseconds")


class CalibrateRequest(BaseModel):
    """Request body for POST /calibrate."""
    child_id: str = Field(..., description="Child user UUID")
    events: List[MouseEvent] = Field(..., min_length=10, description="Calibration mouse events")
    duration: int = Field(30000, description="Calibration duration in ms")
    game_type: str = Field("target_tracking", description="Mini-game type")


class BaselineResult(BaseModel):
    """Computed motor baseline for a child."""
    velocity_baseline: float
    velocity_range: List[float]
    reaction_time_mean: float
    accuracy_score: float
    motor_profile: str = Field(..., description="NORMAL | SLOW | FAST")
    calibrated_at: str


class CalibrateResponse(BaseModel):
    """Response body for POST /calibrate."""
    child_id: str
    baseline: BaselineResult


# ── Segment ────────────────────────────────────────────────

class SegmentRequest(BaseModel):
    """Request body for POST /segment."""
    text: str = Field(..., description="Vietnamese text to segment")


class SegmentResponse(BaseModel):
    """Response body for POST /segment."""
    segmented: str = Field(..., description="Segmented text with underscore-joined compounds")
