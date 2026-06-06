# ReadEase ML Engine

FastAPI microservice for dyslexia reading support and mouse trajectory classification.

## Features

- **Cognitive State Classification**: RandomForest model evaluating 12 kinematic features.
- **Motor Profile Calibration**: Computes velocity baselines, reaction times, and accuracies.
- **Standardized Health Checks**:
  - `GET /` - Full health report containing model loaded state, word tokenizer availability, and version details.
  - `GET /health` - Standardized light health check endpoint returning `{"status": "ok"}`. Satisfies standard orchestrators and Docker HEALTHCHECKs.

## Model Training & Warnings Resolution

To avoid warnings related to `scikit-learn` version mismatches between export (training) and runtime environments (e.g., loading model exported with `1.8.0` in a `1.5.0` runtime):
1. **Docker Container**: During the docker image build, `python training/train_model.py` is run immediately after dependencies are installed. This automatically trains and exports `model.joblib` matching the exact container package versions.
2. **Local Development**: If you encounter version warnings locally, run the training command to regenerate `model.joblib` for your current environment:
   ```bash
   python training/train_model.py
   ```

## Development Commands

### Re-create Environment
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Run Model Training
```bash
python training/train_model.py
```

### Run Tests
```bash
python -m pytest
```

### Run FastAPI Service Locally
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
