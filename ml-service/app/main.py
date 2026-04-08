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
    SegmentRequest,
    SegmentResponse,
)
from .classifier import load_model, is_model_loaded, predict
from .calibration import compute_baseline

# ── Logging ────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("ml-engine")

# ── Vietnamese tokenizer (lazy load) ──────────────────────
_tokenizer_available = False
try:
    from underthesea import word_tokenize as vi_word_tokenize
    _tokenizer_available = True
    logger.info("✓ underthesea loaded for Vietnamese word segmentation")
except ImportError:
    logger.warning("⚠ underthesea not installed — /segment will use fallback splitting")


def segment_text(text: str) -> str:
    """
    Segment Vietnamese text into compound-word tokens joined by underscores.

    Uses underthesea if available, otherwise falls back to whitespace splitting.
    Processes line-by-line to preserve paragraph structure.
    """
    import re

    if not text or not text.strip():
        return ""

    # Normalize whitespace
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    normalized = re.sub(r"[ \t]+", " ", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    normalized = normalized.strip()

    if not normalized:
        return ""

    if not _tokenizer_available:
        return normalized

    lines = normalized.split("\n")
    result_lines = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            result_lines.append("")
            continue

        tokens = vi_word_tokenize(stripped)
        segmented_tokens = [t.replace(" ", "_") for t in tokens]
        result_lines.append(" ".join(segmented_tokens))

    return "\n".join(result_lines)


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
        "tokenizer_available": _tokenizer_available,
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


# ── POST /segment — Vietnamese Word Segmentation ─────────
@app.post("/segment", response_model=SegmentResponse)
def segment(request: SegmentRequest):
    """
    Segment Vietnamese text using underthesea word_tokenize.

    Compound words are joined with underscores for lightweight
    frontend splitting (Hybrid architecture).

    Example:
      Input:  "con bò ăn cỏ"
      Output: "con_bò ăn cỏ"
    """
    segmented = segment_text(request.text)

    return SegmentResponse(segmented=segmented)
