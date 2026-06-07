# ETL Pipeline Overview

**Author:** Diana Chen
**Team:** Data
**Last Updated:** 2026-01-15
**Tags:** etl, pipeline, data-engineering, airflow, s3, data-warehouse

## Overview

The ETL (Extract, Transform, Load) platform ingests data from all operational services, enriches and cleans it, and loads it into the data warehouse for analytics and reporting. The platform processes approximately 2.5 billion events per day at peak.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Data Sources                                                    │
│  PostgreSQL (payments, users) │ SNS/SQS events │ S3 app logs    │
└──────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│  Extraction Layer                                                │
│  - Debezium CDC (PostgreSQL → Kafka)                            │
│  - Kinesis Firehose (events → S3 raw zone)                      │
│  - Scheduled JDBC pulls (nightly full/incremental)              │
└──────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│  Transformation Layer (Apache Spark on EMR)                      │
│  - Deduplication (exactly-once guarantee via idempotency keys)  │
│  - Schema validation and null-filling                           │
│  - PII masking (customer emails, card metadata)                 │
│  - Business metric derivation (LTV, cohorts, funnel)           │
└──────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│  Load Layer                                                      │
│  - Redshift (OLAP warehouse, analytics queries)                 │
│  - DynamoDB (real-time aggregates for dashboards)               │
│  - S3 Parquet (data lake, long-term retention)                  │
└──────────────────────────────────────────────────────────────────┘
```

## Orchestration (Apache Airflow)

Airflow 2.8 on EKS (KubernetesExecutor) schedules all ETL DAGs.

**Airflow UI:** `https://airflow.internal`

| DAG | Schedule | SLA | Description |
|-----|---------|-----|-------------|
| `payments_cdc` | Continuous (60s lag) | 2 min | Payment events via Debezium |
| `user_incremental` | Every 15 min | 20 min | User table incremental load |
| `daily_aggregates` | 02:00 UTC | 08:00 UTC | Revenue and usage aggregates |
| `weekly_cohorts` | Sunday 03:00 UTC | Monday 09:00 UTC | User cohort analysis |
| `pii_masking_sweep` | 01:00 UTC daily | 06:00 UTC | Re-mask any missed PII |

## Data Zones

All data is stored in S3 in a 3-zone medallion architecture:

| Zone | Bucket Prefix | Description | Retention |
|------|-------------|-------------|-----------|
| Bronze (raw) | `s3://acme-data/raw/` | Exactly as received | 90 days |
| Silver (cleaned) | `s3://acme-data/clean/` | Deduplicated, validated, PII masked | 2 years |
| Gold (aggregated) | `s3://acme-data/gold/` | Business metrics, ready for BI | 7 years |

## Change Data Capture (CDC)

Debezium reads PostgreSQL logical replication slots and publishes row-level changes to Kafka topics:

- `payments.charges` → `cdc.production.payments.charges`
- `payments.refunds` → `cdc.production.payments.refunds`
- `users.accounts` → `cdc.production.users.accounts`

Kafka is managed on AWS MSK (3 brokers, replication factor 3).

## PII Handling

All customer identifiers (email, name, phone) are SHA-256 hashed with a per-record salt before landing in the silver zone. The salt is stored separately in AWS Secrets Manager and is accessible only to the PII service account.

Raw PII is retained in the bronze zone for a maximum of 14 days, then purged automatically by an S3 lifecycle rule.

## Pipeline SLAs and Alerting

Airflow SLA misses trigger a PagerDuty P3 alert to the data on-call engineer. Consecutive misses escalate to P2.

Key metrics in Datadog:
- `etl.lag_seconds` per DAG
- `etl.records_processed_per_second`
- `etl.failed_tasks_count`
- `etl.data_quality.null_rate` per critical column

## Common Issues

| Issue | Cause | Resolution |
|-------|-------|-----------|
| DAG stuck in `running` | Spark job OOM | Check EMR logs; increase executor memory |
| CDC lag > 5 minutes | Kafka consumer lag | Scale up Kafka consumer group |
| Redshift load failure | Schema mismatch | Run `scripts/schema_drift_check.py` |
| PII masking skipped | Salt key rotation | Rotate via Secrets Manager, re-run masking sweep |

## Related Documents

- Data Warehouse Architecture
- Real-Time Streaming Pipeline Guide
- Data Quality Framework
- Data Governance Policy
