# Data Catalog and Discovery Guide

**Author:** Ryan O'Brien
**Team:** Data
**Last Updated:** 2025-11-15
**Tags:** data-catalog, discovery, metadata, documentation, lineage, data

## Overview

The data catalog is the single source of truth for discovering, understanding, and accessing all data assets in the organization. We use **DataHub** (open source) backed by Elasticsearch and integrated with our Redshift, S3, Kafka, and Airflow systems.

## Accessing the Catalog

**DataHub URL:** `https://datahub.internal`

Login via Okta SSO. All employees have read access. Write access (adding metadata, ownership) is granted on request to the Data team.

## Catalog Coverage

| Source System | Coverage | Sync Method | Frequency |
|-------------|----------|------------|-----------|
| Redshift | 100% | DataHub ingestion recipe | Daily |
| S3 Data Lake | Gold zone only | DataHub S3 recipe | Daily |
| Kafka MSK | All topics | DataHub Kafka recipe | Hourly |
| Airflow DAGs | All DAGs | DataHub Airflow plugin | Per DAG run |
| dbt models | All models | dbt → DataHub | On dbt run |

## Finding a Dataset

### Search

Use the search bar in DataHub to search by:
- Table name: `fact_payments`
- Column name: `customer_id`
- Owner: `diana.chen@acmecorp.com`
- Tag: `pii`, `payments`, `revenue`
- Description keywords: `"refund amount"`

### Browse

Navigate via the sidebar:
- Datasets → Redshift → `acme_dw` → `fact` → `fact_payments`

### Lineage View

Click "Lineage" on any dataset to see:
- **Upstream:** what feeds this dataset (Airflow DAG, Kafka topic, raw table)
- **Downstream:** what consumes this dataset (Looker Explore, dbt model, ML feature view)

This is critical for impact analysis before schema changes.

## Adding Metadata

### Ownership

Every table must have an owner. Add via DataHub UI or CLI:
```bash
datahub dataset add_owner \
  --urn "urn:li:dataset:(urn:li:dataPlatform:redshift,acme_dw.fact.fact_payments,PROD)" \
  --owner "diana.chen@acmecorp.com" \
  --owner-type TECHNICAL_OWNER
```

### Tags

Tag datasets for discovery. Standard tags:
- `pii` — contains personally identifiable information
- `payments` — payment transaction data
- `revenue` — used in financial reporting
- `ml-feature` — used as input to ML models
- `deprecated` — no longer maintained; contact owner before using

### Column-Level Documentation

Document columns via dbt YAML schema files:
```yaml
models:
  - name: fact_payments
    columns:
      - name: amount_usd
        description: "Charge amount normalized to USD at the exchange rate at time of charge. Used for all financial reporting."
        data_type: DECIMAL(18,4)
        tests:
          - not_null
          - positive_value
```

dbt docs are synced to DataHub automatically.

## Schema Change Process

Before changing a table schema in production:

1. Check DataHub lineage to identify all downstream consumers
2. Notify consumers in `#data-schema-changes` Slack channel at least **5 business days** in advance
3. For additive changes (new nullable column): direct migration
4. For breaking changes (rename, type change, drop): versioned migration with deprecation period
5. Update the DataHub catalog description with the change and effective date

## Deprecated Datasets

Datasets tagged `deprecated` will be removed on the listed sunset date. Do not build new pipelines on deprecated datasets.

Current deprecated datasets:
| Dataset | Sunset Date | Replacement |
|---------|------------|-------------|
| `raw.legacy_payments` | 2026-03-01 | `fact.fact_payments` |
| `agg.old_cohorts` | 2026-02-15 | `agg.agg_weekly_cohorts` |

## Related Documents

- Data Governance Policy
- Data Warehouse Architecture
- ETL Pipeline Overview
