# Data Warehouse Architecture

**Author:** Ryan O'Brien
**Team:** Data
**Last Updated:** 2025-12-20
**Tags:** data-warehouse, redshift, architecture, analytics, sql, olap

## Overview

Our data warehouse is built on Amazon Redshift, organized using a Kimball-style dimensional model. It serves as the single source of truth for all business intelligence, financial reporting, and ad-hoc analytics queries.

## Cluster Configuration

| Parameter | Value |
|-----------|-------|
| Cluster type | ra3.4xlarge (Managed Storage) |
| Node count | 4 |
| vCPU per node | 12 |
| Storage | 128 TB (managed, auto-scaled) |
| Concurrency scaling | Enabled (burst to 10 clusters) |
| Maintenance window | Sunday 03:00–05:00 UTC |

## Schema Organization

```
acme_dw (database)
├── raw (schema)          — Direct loads from ETL, no transformations
│   ├── payments_charges
│   ├── payments_refunds
│   └── users_accounts
│
├── dim (schema)          — Dimension tables
│   ├── dim_customer
│   ├── dim_product
│   ├── dim_date
│   └── dim_geography
│
├── fact (schema)         — Fact tables
│   ├── fact_payments
│   ├── fact_subscriptions
│   ├── fact_user_events
│   └── fact_support_tickets
│
├── agg (schema)          — Pre-aggregated for performance
│   ├── agg_daily_revenue
│   ├── agg_weekly_cohorts
│   └── agg_monthly_retention
│
└── mart (schema)         — Team-specific data marts
    ├── finance_mart
    ├── growth_mart
    └── product_mart
```

## Key Tables

### fact_payments

The central fact table for all revenue analysis.

| Column | Type | Description |
|--------|------|-------------|
| payment_key | BIGINT | Surrogate key |
| customer_key | BIGINT | FK to dim_customer |
| date_key | INTEGER | FK to dim_date (YYYYMMDD) |
| amount_usd | DECIMAL(18,4) | Normalized to USD |
| amount_local | DECIMAL(18,4) | Original currency amount |
| currency | CHAR(3) | ISO 4217 |
| status | VARCHAR(20) | succeeded/failed/refunded |
| payment_method_type | VARCHAR(30) | card/bank_transfer/etc |
| stripe_charge_id | VARCHAR(50) | Stripe's charge ID |
| is_subscription | BOOLEAN | |
| refund_amount_usd | DECIMAL(18,4) | Partial or full refund |

### dim_customer

SCD Type 2 customer dimension.

| Column | Type | Description |
|--------|------|-------------|
| customer_key | BIGINT | Surrogate key (PK) |
| customer_id | UUID | Business key (from app) |
| email_hash | VARCHAR(64) | SHA-256 hash |
| signup_date | DATE | |
| plan_tier | VARCHAR(20) | free/pro/enterprise |
| country_code | CHAR(2) | |
| is_current | BOOLEAN | Type 2 current row flag |
| valid_from | DATE | |
| valid_to | DATE | NULL if current |

## Distribution and Sort Keys

```sql
-- fact_payments: distribute on customer_key (co-locate with dim_customer joins)
-- Sort key: date_key (range queries by date are common)
DISTSTYLE KEY
DISTKEY (customer_key)
COMPOUND SORTKEY (date_key, customer_key)
```

Distribution strategy reviewed quarterly. Current join patterns:
- 82% of queries join fact_payments to dim_customer and dim_date
- 15% join to dim_geography for regional analysis

## Performance Guidelines

### Vacuuming

Vacuum should run after bulk deletes or updates:
```sql
-- Check tables needing vacuum
SELECT "table", unsorted, stats_off, tbl_rows
FROM SVV_TABLE_INFO
WHERE unsorted > 5 OR stats_off > 10
ORDER BY tbl_rows DESC;

-- Vacuum fact table
VACUUM SORT ONLY fact.fact_payments;
ANALYZE fact.fact_payments;
```

### Query Best Practices

1. Always filter on `date_key` (sort key) to reduce data scanned
2. Avoid `SELECT *` — Redshift is columnar, unused columns waste I/O
3. Use `agg_` tables for dashboard queries instead of computing from fact tables
4. Use `UNLOAD` for large result sets instead of fetching via JDBC

### WLM (Workload Management)

| Queue | Priority | Max Concurrency | Use |
|-------|---------|----------------|-----|
| `dashboards` | High | 10 | BI tool queries |
| `reports` | Medium | 5 | Scheduled reports |
| `ad_hoc` | Low | 15 | Analyst queries |
| `etl` | Highest | 3 | Nightly ETL loads |

## Access Control

| Role | Access | Users |
|------|--------|-------|
| `analyst_ro` | SELECT on dim, fact, agg | Data analysts, BI tools |
| `mart_writer` | INSERT/UPDATE on mart | ETL service account |
| `raw_writer` | INSERT on raw | ETL service account |
| `admin` | ALL | Data team leads only |

## Backup and Recovery

- Automated snapshots: every 8 hours, retained 7 days
- Manual snapshot before major schema changes
- Cross-region snapshot copy to us-west-2 (daily)

## Related Documents

- ETL Pipeline Overview
- Analytics Dashboard Guide
- Data Quality Framework
