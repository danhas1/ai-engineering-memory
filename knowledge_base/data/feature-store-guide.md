# Feature Store Guide

**Author:** Diana Chen
**Team:** Data
**Last Updated:** 2025-12-01
**Tags:** feature-store, machine-learning, feast, feature-engineering, mlops, data

## Overview

The Feature Store centralizes ML feature computation, versioning, and serving, ensuring consistent features between model training and inference. We use Feast (open source) backed by Redis (online store) and Redshift (offline store).

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Feature Computation Pipeline                                        │
│  (Apache Spark + Airflow DAGs)                                       │
└──────────────────────────────────────────────────────────────────────┘
          │ Batch features (daily)          │ Stream features (real-time)
          ▼                                  ▼
┌─────────────────────┐           ┌─────────────────────┐
│  Offline Store      │           │  Online Store        │
│  (Redshift)         │           │  (Redis ElastiCache) │
│  Historical feature │           │  Low-latency serving │
│  values for training│           │  for inference (<5ms)│
└─────────────────────┘           └─────────────────────┘
```

## Registered Feature Views

### User Risk Features (`user_risk_fv`)

Computed daily, used by the fraud model.

| Feature | Type | Description |
|---------|------|-------------|
| `days_since_signup` | INT | Account age in days |
| `total_charge_count_30d` | INT | Charges in last 30 days |
| `avg_charge_amount_30d` | FLOAT | Average charge amount |
| `failed_charge_rate_7d` | FLOAT | Failed / total charges, 7d |
| `unique_cards_30d` | INT | Distinct payment methods |
| `support_ticket_count_90d` | INT | Support tickets filed |

### Customer LTV Features (`customer_ltv_fv`)

Computed weekly.

| Feature | Type | Description |
|---------|------|-------------|
| `historical_ltv_usd` | FLOAT | All-time net revenue |
| `predicted_ltv_12m_usd` | FLOAT | Model-predicted 12-month LTV |
| `subscription_months` | INT | Total paid subscription months |
| `churn_probability` | FLOAT | 90-day churn score |

## Retrieving Features

### Training (Offline)

```python
from feast import FeatureStore

store = FeatureStore(repo_path="./feature_repo")

training_df = store.get_historical_features(
    entity_df=entity_df,   # Must contain: customer_id, event_timestamp
    features=[
        "user_risk_fv:failed_charge_rate_7d",
        "user_risk_fv:total_charge_count_30d",
        "customer_ltv_fv:churn_probability",
    ],
).to_df()
```

### Inference (Online)

```python
feature_vector = store.get_online_features(
    features=[
        "user_risk_fv:failed_charge_rate_7d",
        "user_risk_fv:unique_cards_30d",
    ],
    entity_rows=[{"customer_id": customer_id}],
).to_dict()

risk_score = model.predict(feature_vector)
```

Online latency: p99 < 5ms (Redis hit); p99 < 50ms (Redis miss + recompute)

## Adding a New Feature

1. Define the feature view in `feature_repo/feature_views.py`
2. Write the transformation in `feature_repo/transformations/<name>.py`
3. Register: `feast apply`
4. Run backfill for offline store: `python scripts/backfill_features.py --feature-view <name> --start 2025-01-01`
5. Populate online store: `feast materialize-incremental $(date +%Y-%m-%dT%H:%M:%S)`

Feature PRs require review by the ML lead and a data engineer.

## Materialization Schedule

| Feature View | Offline Backfill | Online Materialize |
|-------------|-----------------|-------------------|
| `user_risk_fv` | Daily 02:00 UTC | Continuous (15-min lag) |
| `customer_ltv_fv` | Weekly Sunday | Daily 04:00 UTC |

## Monitoring

Feast logs feature serve latencies and freshness metrics. Alerts fire when:
- Online store freshness > 2× materialization interval
- Feature retrieval error rate > 1%
- Null rate for a feature > 5% (indicates upstream pipeline issue)

## Related Documents

- ETL Pipeline Overview
- ML Model Training Pipeline
- Data Warehouse Architecture
