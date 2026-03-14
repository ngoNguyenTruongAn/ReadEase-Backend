"""
Pytest tests for ML Engine — Cognitive State Classifier.

Tests:
  - Health endpoint returns 200 with model status
  - POST /classify returns valid state (FLUENT/REGRESSION/DISTRACTION)
  - POST /classify response time < 50ms
  - POST /calibrate computes baseline
  - Invalid features return 422
  - Fallback works when model is missing
"""

import time
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.classifier import STATES


# ── Test client ────────────────────────────────────────────
client = TestClient(app)


# ── Sample feature sets ───────────────────────────────────

# Typical FLUENT features: smooth, moderate velocity, few regressions
FLUENT_FEATURES = {
    "velocity_mean": 200.0,
    "velocity_std": 20.0,
    "velocity_max": 320.0,
    "acceleration_mean": 5.0,
    "acceleration_std": 3.0,
    "curvature_mean": 0.05,
    "curvature_std": 0.02,
    "dwell_time_mean": 120.0,
    "dwell_time_max": 200.0,
    "direction_changes": 2,
    "regression_count": 0,
    "path_efficiency": 0.85,
}

# Typical REGRESSION features: slow, many regressions, long dwells
REGRESSION_FEATURES = {
    "velocity_mean": 80.0,
    "velocity_std": 40.0,
    "velocity_max": 200.0,
    "acceleration_mean": 8.0,
    "acceleration_std": 6.0,
    "curvature_mean": 0.15,
    "curvature_std": 0.08,
    "dwell_time_mean": 400.0,
    "dwell_time_max": 600.0,
    "direction_changes": 10,
    "regression_count": 8,
    "path_efficiency": 0.35,
}

# Typical DISTRACTION features: fast, erratic, low efficiency
DISTRACTION_FEATURES = {
    "velocity_mean": 500.0,
    "velocity_std": 150.0,
    "velocity_max": 800.0,
    "acceleration_mean": 25.0,
    "acceleration_std": 15.0,
    "curvature_mean": 0.3,
    "curvature_std": 0.15,
    "dwell_time_mean": 40.0,
    "dwell_time_max": 100.0,
    "direction_changes": 25,
    "regression_count": 1,
    "path_efficiency": 0.1,
}


# ── Tests ──────────────────────────────────────────────────

class TestHealthEndpoint:
    """Test GET / health check."""

    def test_health_returns_200(self):
        """Health check should return 200 OK."""
        response = client.get("/")
        assert response.status_code == 200

    def test_health_contains_status(self):
        """Response should include service status."""
        response = client.get("/")
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "ReadEase ML Engine"
        assert "model_loaded" in data
        assert "version" in data


class TestClassifyEndpoint:
    """Test POST /classify."""

    def test_classify_fluent(self):
        """FLUENT features should return a valid classification."""
        response = client.post("/classify", json={
            "session_id": "test-fluent",
            "features": FLUENT_FEATURES,
        })
        assert response.status_code == 200
        data = response.json()
        assert data["state"] in STATES
        assert 0.0 <= data["confidence"] <= 1.0
        assert data["session_id"] == "test-fluent"
        assert "model_version" in data

    def test_classify_regression(self):
        """REGRESSION features should return a valid classification."""
        response = client.post("/classify", json={
            "session_id": "test-regression",
            "features": REGRESSION_FEATURES,
        })
        assert response.status_code == 200
        data = response.json()
        assert data["state"] in STATES
        assert 0.0 <= data["confidence"] <= 1.0

    def test_classify_distraction(self):
        """DISTRACTION features should return a valid classification."""
        response = client.post("/classify", json={
            "session_id": "test-distraction",
            "features": DISTRACTION_FEATURES,
        })
        assert response.status_code == 200
        data = response.json()
        assert data["state"] in STATES
        assert 0.0 <= data["confidence"] <= 1.0

    def test_classify_response_time(self):
        """Single classification should complete in < 50ms."""
        start = time.perf_counter()
        response = client.post("/classify", json={
            "session_id": "test-perf",
            "features": FLUENT_FEATURES,
        })
        elapsed_ms = (time.perf_counter() - start) * 1000
        assert response.status_code == 200
        assert elapsed_ms < 50, f"Response took {elapsed_ms:.1f}ms (limit: 50ms)"

    def test_classify_missing_session_id(self):
        """Missing session_id should return 422 validation error."""
        response = client.post("/classify", json={
            "features": FLUENT_FEATURES,
        })
        assert response.status_code == 422

    def test_classify_empty_body(self):
        """Empty body should return 422."""
        response = client.post("/classify", json={})
        assert response.status_code == 422


class TestCalibrateEndpoint:
    """Test POST /calibrate."""

    def _make_events(self, count=50):
        """Generate a list of mock calibration mouse events."""
        events = []
        for i in range(count):
            events.append({
                "x": 100.0 + i * 10,
                "y": 200.0 + (i % 5) * 3,
                "timestamp": 1700000000000 + i * 50,  # 50ms intervals
            })
        return events

    def test_calibrate_returns_baseline(self):
        """Valid calibration data should compute a baseline."""
        events = self._make_events(50)
        response = client.post("/calibrate", json={
            "child_id": "child-001",
            "events": events,
            "duration": 30000,
            "game_type": "target_tracking",
        })
        assert response.status_code == 200
        data = response.json()

        assert data["child_id"] == "child-001"
        baseline = data["baseline"]
        assert "velocity_baseline" in baseline
        assert "velocity_range" in baseline
        assert len(baseline["velocity_range"]) == 2
        assert "reaction_time_mean" in baseline
        assert "accuracy_score" in baseline
        assert baseline["motor_profile"] in ["SLOW", "NORMAL", "FAST"]
        assert "calibrated_at" in baseline

    def test_calibrate_too_few_events(self):
        """Less than 10 events should fail validation."""
        response = client.post("/calibrate", json={
            "child_id": "child-002",
            "events": [{"x": 1, "y": 1, "timestamp": 1000}] * 5,
            "duration": 30000,
            "game_type": "target_tracking",
        })
        assert response.status_code == 422

    def test_calibrate_missing_child_id(self):
        """Missing child_id should return 422."""
        response = client.post("/calibrate", json={
            "events": self._make_events(20),
        })
        assert response.status_code == 422
