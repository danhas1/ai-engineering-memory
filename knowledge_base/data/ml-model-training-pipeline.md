# ML Model Training Pipeline

**Author:** Nina Kowalski
**Team:** Data
**Last Updated:** 2025-11-30
**Tags:** machine-learning, mlops, sagemaker, training, model-deployment, data

## Overview

This document covers the ML model training pipeline, versioning, deployment, and monitoring. The data team owns the infrastructure; individual model owners (data scientists) own the models themselves.

## Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Training | Amazon SageMaker | Managed training jobs |
| Experiment tracking | MLflow (self-hosted) | Metrics, params, artifacts |
| Model registry | MLflow Model Registry | Version management |
| Feature serving | Feast (Feature Store) | Training and inference features |
| Inference | SageMaker Endpoints | Low-latency serving |
| Orchestration | Airflow | Retraining schedule |

## Active Models

| Model | Purpose | Owner | Retrain Schedule |
|-------|---------|-------|-----------------|
| `fraud_scorer_v3` | Real-time fraud risk score | Marcus Wong | Weekly |
| `churn_predictor_v2` | 90-day churn probability | Nina Kowalski | Monthly |
| `ltv_estimator_v1` | Customer lifetime value | Ryan O'Brien | Monthly |
| `recommendation_ranker_v4` | Product recommendations | ML Platform | Daily |

## Training Workflow

```
1. Feature extraction (Feast offline store)
       │
       ▼
2. Data validation (Great Expectations)
       │
       ▼
3. SageMaker Training Job
   - Instance: ml.m5.4xlarge
   - Container: custom (PyTorch / XGBoost)
   - Input: S3 (feature parquet files)
   - Output: S3 (model artifacts)
       │
       ▼
4. Model evaluation
   - Test set AUC/F1/RMSE
   - Bias analysis (Fairness checks)
   - Compare to champion model
       │
       ▼
5. MLflow Model Registry promotion
   Staging → Production (requires eval thresholds)
       │
       ▼
6. SageMaker Endpoint update (blue/green)
```

## Model Promotion Criteria

A new model version is promoted to production only if:

| Model | Metric | Threshold vs Champion |
|-------|--------|----------------------|
| fraud_scorer | AUC-ROC | ≥ current - 0.005 |
| churn_predictor | F1 Score | ≥ current - 0.01 |
| ltv_estimator | RMSE | ≤ current × 1.05 |

Promotion also requires:
- No data leakage detected
- Bias metrics within acceptable range (demographic parity difference < 0.05)
- Human review by model owner

## Retraining Pipeline (Airflow DAG)

```python
with DAG("fraud_model_retrain", schedule_interval="@weekly") as dag:
    extract = PythonOperator(task_id="extract_features", python_callable=extract_feast_features)
    validate = PythonOperator(task_id="validate_data", python_callable=run_ge_checks)
    train = SageMakerTrainingOperator(task_id="train", config=TRAINING_CONFIG)
    evaluate = PythonOperator(task_id="evaluate", python_callable=evaluate_model)
    promote = PythonOperator(task_id="promote_if_better", python_callable=promote_to_staging)

    extract >> validate >> train >> evaluate >> promote
```

## Model Drift Monitoring

Models in production are monitored for:
- **Data drift:** PSI (Population Stability Index) on input features > 0.2 triggers alert
- **Prediction drift:** Distribution of output scores shifts > 15% week-over-week
- **Performance degradation:** Precision/recall on labelled feedback data drops below threshold

Monitoring runs daily via SageMaker Model Monitor. Alerts go to `#ml-monitoring` Slack.

## Model Artifacts

All model artifacts (weights, scaler, encoder) are stored in S3:
```
s3://acme-ml-artifacts/
  models/
    fraud_scorer/
      v3.2.1/
        model.tar.gz
        metadata.json
        evaluation_report.pdf
```

Artifacts are immutable once registered. Never overwrite a version.

## Related Documents

- Feature Store Guide
- ETL Pipeline Overview
- Data Quality Framework
