"""
ReadEase ML Engine — Cognitive State Classifier
FastAPI microservice for mouse trajectory classification.

Endpoints:
  GET  /           → Health check (model status)
  POST /classify   → Classify cognitive state from 12 kinematic features
  POST /calibrate  → Process 30s calibration game → compute motor baseline
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .schemas import (
    ClassifyRequest,
    ClassifyResponse,
    CalibrateRequest,
    CalibrateResponse,
    BaselineResult,
)
from .classifier import load_model, is_model_loaded, predict
from .calibration import compute_baseline

# ── Logging ────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("ml-engine")


# ── Lifespan: load model on startup ───────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the trained ML model when the server starts."""
    logger.info("Starting ML Engine...")
    loaded = load_model()
    if loaded:
        logger.info("✓ Model loaded successfully")
    else:
        logger.warning("⚠ Model not loaded — using fallback classifier")
    yield
    logger.info("Shutting down ML Engine")


# ── FastAPI App ────────────────────────────────────────────
app = FastAPI(
    title="ReadEase ML Engine",
    description="Cognitive state classifier for dyslexia reading support",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── GET / — Health Check ──────────────────────────────────
@app.get("/")
def health():
    """Health check with model status."""
    return {
        "status": "ok",
        "service": "ReadEase ML Engine",
        "model_loaded": is_model_loaded(),
        "version": "1.0.0",
    }


# ── POST /classify — Cognitive State Prediction ───────────
@app.post("/classify", response_model=ClassifyResponse)
def classify(request: ClassifyRequest):
    """
    Classify cognitive state from 12 kinematic features.

    Flow:
      1. Extract features dict from request
      2. Normalize features using trained scaler
      3. Run RandomForest prediction
      4. Return state + confidence

    If model is not loaded, falls back to threshold-based rules.
    """
    # Convert Pydantic model → dict for classifier
    features_dict = request.features.model_dump()

    # Run prediction (model or fallback)
    result = predict(features_dict)

    return ClassifyResponse(
        state=result["state"],
        confidence=result["confidence"],
        session_id=request.session_id,
        model_version=result["model_version"],
    )


# ── POST /calibrate — Motor Baseline Processing ──────────
@app.post("/calibrate", response_model=CalibrateResponse)
def calibrate(request: CalibrateRequest):
    """
    Process 30-second calibration mini-game data.

    Flow:
      1. Receive mouse events from calibration game
      2. Compute velocity baseline, reaction time, accuracy
      3. Classify motor profile (SLOW / NORMAL / FAST)
      4. Return baseline for per-child normalization
    """
    # Convert Pydantic models → dicts
    events = [{"x": e.x, "y": e.y, "timestamp": e.timestamp} for e in request.events]

    try:
        baseline = compute_baseline(events)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return CalibrateResponse(
        child_id=request.child_id,
        baseline=BaselineResult(**baseline),
    )
