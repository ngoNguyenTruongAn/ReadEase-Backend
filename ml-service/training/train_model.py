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
  6. Save classification report + feature importances → results/
  7. Save confusion matrix heatmap → results/confusion_matrix.png
  8. Save feature importance chart → results/feature_importance.png
  9. Export model + scaler → app/models/model.joblib

Usage:
    python train_model.py          # Train + save results
    python train_model.py --report # Only show saved results (no retraining)

Target: ≥ 85% accuracy, per-class F1 ≥ 0.80
"""

import os
import sys
import json
import datetime
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix
import joblib
import matplotlib
matplotlib.use("Agg")   # Non-interactive backend (no GUI needed)
import matplotlib.pyplot as plt
import seaborn as sns


# ── Output directory for all results ───────────────────────
RESULTS_DIR = os.path.join(os.path.dirname(__file__), "..", "results")
REPORT_PATH = os.path.join(RESULTS_DIR, "training_report.json")
CM_PATH     = os.path.join(RESULTS_DIR, "confusion_matrix.png")
FI_PATH     = os.path.join(RESULTS_DIR, "feature_importance.png")
CV_PATH     = os.path.join(RESULTS_DIR, "cv_scores.png")


def show_saved_report():
    """Display the last saved training report without retraining."""
    if not os.path.exists(REPORT_PATH):
        print("❌  No saved report found. Run without --report flag to train first.")
        return

    with open(REPORT_PATH, "r", encoding="utf-8") as f:
        report = json.load(f)

    print("\n" + "=" * 60)
    print("  SAVED TRAINING REPORT")
    print(f"  Trained at: {report['trained_at']}")
    print("=" * 60)
    print(f"\n  Samples:     {report['n_samples']} total")
    print(f"  Train/Test:  {report['n_train']} / {report['n_test']}")
    print(f"\n  Accuracy:    {report['accuracy']:.4f}  ({'✓ Meets' if report['accuracy'] >= 0.85 else '⚠ Below'} target ≥ 0.85)")
    print(f"  CV Mean:     {report['cv_mean']:.4f} ± {report['cv_std']:.4f}")
    print("\n  Classification Report:")
    print(report["classification_report"])
    print("\n  Feature Importances:")
    for name, imp in report["feature_importances"]:
        bar = "█" * int(imp * 50)
        print(f"    {name:25s} {imp:.4f} {bar}")

    print(f"\n📊 Charts saved in: {RESULTS_DIR}")
    print(f"   • {CM_PATH}")
    print(f"   • {FI_PATH}")
    print(f"   • {CV_PATH}")


def save_confusion_matrix(y_test, y_pred, labels):
    """Save confusion matrix as a heatmap PNG."""
    cm = confusion_matrix(y_test, y_pred, labels=labels)
    fig, ax = plt.subplots(figsize=(7, 5))

    sns.heatmap(
        cm,
        annot=True,
        fmt="d",
        cmap="Blues",
        xticklabels=labels,
        yticklabels=labels,
        linewidths=0.5,
        ax=ax,
    )
    ax.set_title("Confusion Matrix — ReadEase Cognitive State Classifier", fontsize=13, pad=12)
    ax.set_xlabel("Predicted Label", fontsize=11)
    ax.set_ylabel("True Label", fontsize=11)
    plt.tight_layout()
    plt.savefig(CM_PATH, dpi=150)
    plt.close()
    print(f"  ✓ Confusion matrix saved → {CM_PATH}")


def save_feature_importance(feature_names, importances):
    """Save feature importance as a horizontal bar chart PNG."""
    # Sort descending
    sorted_idx = np.argsort(importances)
    sorted_names = [feature_names[i] for i in sorted_idx]
    sorted_imps  = importances[sorted_idx]

    fig, ax = plt.subplots(figsize=(9, 6))
    colors = sns.color_palette("Blues_d", len(sorted_names))
    bars = ax.barh(sorted_names, sorted_imps, color=colors)

    # Add value labels on bars
    for bar, val in zip(bars, sorted_imps):
        ax.text(
            bar.get_width() + 0.002, bar.get_y() + bar.get_height() / 2,
            f"{val:.4f}", va="center", ha="left", fontsize=9
        )

    ax.set_title("Feature Importances — RandomForest", fontsize=13, pad=12)
    ax.set_xlabel("Importance Score", fontsize=11)
    ax.set_xlim(0, max(sorted_imps) * 1.2)
    plt.tight_layout()
    plt.savefig(FI_PATH, dpi=150)
    plt.close()
    print(f"  ✓ Feature importance chart saved → {FI_PATH}")


def save_cv_scores(scores):
    """Save cross-validation fold scores as a bar chart PNG."""
    folds = [f"Fold {i+1}" for i in range(len(scores))]

    fig, ax = plt.subplots(figsize=(7, 4))
    bar_colors = ["#2196F3" if s >= 0.85 else "#F44336" for s in scores]
    bars = ax.bar(folds, scores, color=bar_colors, width=0.5, zorder=3)

    # Draw target line
    ax.axhline(y=0.85, color="#FF5722", linestyle="--", linewidth=1.5, label="Target (0.85)")

    # Value labels
    for bar, val in zip(bars, scores):
        ax.text(
            bar.get_x() + bar.get_width() / 2, val + 0.005,
            f"{val:.4f}", ha="center", va="bottom", fontsize=10, fontweight="bold"
        )

    ax.set_ylim(0, 1.1)
    ax.set_title("5-Fold Cross-Validation Accuracy", fontsize=13, pad=12)
    ax.set_ylabel("Accuracy", fontsize=11)
    ax.legend(fontsize=10)
    ax.grid(axis="y", alpha=0.4, zorder=0)
    plt.tight_layout()
    plt.savefig(CV_PATH, dpi=150)
    plt.close()
    print(f"  ✓ CV scores chart saved → {CV_PATH}")


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
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # ── 4. Train/test split (80/20, stratified) ────────────
    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y,
        test_size=0.2,
        stratify=y,
        random_state=42,
    )
    print(f"Train: {len(X_train)} samples | Test: {len(X_test)} samples\n")

    # ── 5. Train RandomForest ──────────────────────────────
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
    labels = sorted(y.unique())

    print("=" * 60)
    print("  CLASSIFICATION REPORT")
    print("=" * 60)
    clf_report_str = classification_report(y_test, y_pred)
    print(clf_report_str)

    # ── 7. Cross-validation (5-fold) ──────────────────────
    scores = cross_val_score(clf, X_scaled, y, cv=5)
    print(f"5-Fold CV Accuracy: {scores.mean():.4f} (+/- {scores.std():.4f})")
    print(f"Per-fold scores: {[f'{s:.4f}' for s in scores]}\n")

    # ── 8. Feature importance ──────────────────────────────
    feature_names = list(X.columns)
    importances = clf.feature_importances_
    fi_sorted = sorted(zip(feature_names, importances), key=lambda x: -x[1])
    print("Feature Importances:")
    for name, imp in fi_sorted:
        bar = "█" * int(imp * 50)
        print(f"  {name:25s} {imp:.4f} {bar}")
    print()

    # ── 9. Save model + scaler ─────────────────────────────
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

    # ── 11. Save charts & report ───────────────────────────
    print("\n📊 Saving results...")
    os.makedirs(RESULTS_DIR, exist_ok=True)

    save_confusion_matrix(y_test, y_pred, labels)
    save_feature_importance(np.array(feature_names), importances)
    save_cv_scores(scores)

    # Save JSON report
    report = {
        "trained_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "n_samples": len(data),
        "n_train": len(X_train),
        "n_test": len(X_test),
        "accuracy": round(float(accuracy), 6),
        "cv_mean": round(float(scores.mean()), 6),
        "cv_std": round(float(scores.std()), 6),
        "cv_scores": [round(float(s), 6) for s in scores],
        "classification_report": clf_report_str,
        "confusion_matrix": confusion_matrix(y_test, y_pred, labels=labels).tolist(),
        "feature_importances": [(name, round(float(imp), 6)) for name, imp in fi_sorted],
    }
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"  ✓ JSON report saved → {REPORT_PATH}")

    print("\n✅ Done! Run 'python train_model.py --report' next time to view results without retraining.")


if __name__ == "__main__":
    if "--report" in sys.argv:
        show_saved_report()
    else:
        main()
