"""
Model Training Script — ReadEase Cognitive State Classifier
=============================================================
Trains a RandomForest classifier on synthetic kinematic data.

Pipeline:
  1. Load training_data.csv
  2. StandardScaler normalization
  3. 80/20 stratified train/test split
  4. RandomForest training (100 trees, max_depth=10, balanced)
  5. 5-fold cross-validation
  6. Print classification report + feature importances
  7. Export model + scaler → app/models/model.joblib

Usage:
    python train_model.py

Target: ≥ 85% accuracy, per-class F1 ≥ 0.80
"""

import os
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix
import joblib


def main():
    # ── 1. Load data ───────────────────────────────────────
    data_path = os.path.join(os.path.dirname(__file__), "training_data.csv")
    if not os.path.exists(data_path):
        print("training_data.csv not found. Run generate_synthetic.py first.")
        return

    data = pd.read_csv(data_path)
    print(f"Loaded {len(data)} samples")
    print(f"Class distribution:\n{data['label'].value_counts()}\n")

    # ── 2. Separate features and labels ────────────────────
    X = data.drop("label", axis=1)     # 12 feature columns
    y = data["label"]                  # FLUENT / REGRESSION / DISTRACTION

    # ── 3. Normalize features ──────────────────────────────
    # StandardScaler: zero mean, unit variance
    # This ensures features with different scales (e.g., velocity 200 vs
    # direction_changes 5) contribute equally to the classifier.
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # ── 4. Train/test split (80/20, stratified) ────────────
    # Stratified = same class ratio in train and test sets
    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y,
        test_size=0.2,
        stratify=y,       # Equal class proportions
        random_state=42,   # Reproducible
    )
    print(f"Train: {len(X_train)} samples | Test: {len(X_test)} samples\n")

    # ── 5. Train RandomForest ──────────────────────────────
    # n_estimators=100: 100 decision trees (ensemble)
    # max_depth=10: limit each tree to prevent overfitting
    # min_samples_split=5: minimum samples to split a node
    # class_weight='balanced': adjust weights for imbalanced classes
    clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        min_samples_split=5,
        random_state=42,
        class_weight="balanced",
    )
    clf.fit(X_train, y_train)

    # ── 6. Evaluate on test set ────────────────────────────
    y_pred = clf.predict(X_test)

    print("=" * 60)
    print("  CLASSIFICATION REPORT")
    print("=" * 60)
    print(classification_report(y_test, y_pred))

    print("Confusion Matrix:")
    print(confusion_matrix(y_test, y_pred))
    print()

    # ── 7. Cross-validation (5-fold) ──────────────────────
    # Tests model stability across different data splits
    scores = cross_val_score(clf, X_scaled, y, cv=5)
    print(f"5-Fold CV Accuracy: {scores.mean():.4f} (+/- {scores.std():.4f})")
    print(f"Per-fold scores: {[f'{s:.4f}' for s in scores]}\n")

    # ── 8. Feature importance ──────────────────────────────
    # Shows which features the model relies on most
    print("Feature Importances:")
    feature_names = X.columns
    importances = clf.feature_importances_
    for name, imp in sorted(zip(feature_names, importances), key=lambda x: -x[1]):
        bar = "█" * int(imp * 50)
        print(f"  {name:25s} {imp:.4f} {bar}")
    print()

    # ── 9. Save model + scaler ─────────────────────────────
    # Bundle both into one file so they stay in sync
    model_dir = os.path.join(os.path.dirname(__file__), "..", "app", "models")
    os.makedirs(model_dir, exist_ok=True)

    model_path = os.path.join(model_dir, "model.joblib")
    joblib.dump({"model": clf, "scaler": scaler}, model_path)
    print(f"✓ Model saved to {model_path}")

    # ── 10. Verify accuracy target ─────────────────────────
    accuracy = clf.score(X_test, y_test)
    if accuracy >= 0.85:
        print(f"✓ Accuracy {accuracy:.4f} meets target (≥ 0.85)")
    else:
        print(f"⚠ Accuracy {accuracy:.4f} below target (≥ 0.85)")


if __name__ == "__main__":
    main()
