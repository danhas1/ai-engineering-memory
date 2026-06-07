# Data Quality Framework

**Author:** Diana Chen
**Team:** Data
**Last Updated:** 2026-01-25
**Tags:** data-quality, great-expectations, testing, dq, monitoring, data

## Overview

Data quality is enforced at every stage of the pipeline using a combination of automated checks (Great Expectations), schema validation (Pydantic), and anomaly detection (custom statistical monitors). A data quality failure blocks downstream consumption until resolved.

## Quality Dimensions

We measure quality across five dimensions:

| Dimension | Definition | Example Check |
|-----------|-----------|--------------|
| Completeness | Required fields are not null | `payment_id NOT NULL` |
| Accuracy | Values are in valid ranges | `amount_usd BETWEEN 0 AND 1000000` |
| Consistency | Cross-table relationships valid | Refund ≤ payment amount |
| Freshness | Data arrived within SLA | Latest record < 2 hours old |
| Uniqueness | No duplicate records | `payment_id` is unique per day |

## Great Expectations Integration

Each ETL pipeline has a GE Expectation Suite defined in `data/great_expectations/expectations/`.

### Example Suite: `payments_daily`

```python
suite = context.create_expectation_suite("payments_daily")

# Completeness
suite.add_expectation(
    ExpectColumnValuesToNotBeNull(column="payment_id")
)
suite.add_expectation(
    ExpectColumnValuesToNotBeNull(column="customer_id")
)

# Accuracy
suite.add_expectation(
    ExpectColumnValuesToBeBetween(column="amount_usd", min_value=0, max_value=1_000_000)
)
suite.add_expectation(
    ExpectColumnValuesToBeInSet(column="status", value_set=["succeeded", "failed", "refunded"])
)

# Uniqueness
suite.add_expectation(
    ExpectColumnValuesToBeUnique(column="payment_id")
)

# Freshness (custom expectation)
suite.add_expectation(
    ExpectColumnMaxToBeBetween(
        column="created_at",
        min_value=(datetime.utcnow() - timedelta(hours=2)).isoformat(),
        max_value=datetime.utcnow().isoformat(),
    )
)
```

### Running Checks

```bash
# Run a suite against a specific batch
great_expectations checkpoint run payments_daily_checkpoint

# View results
great_expectations docs build && open great_expectations/uncommitted/data_docs/local_site/index.html
```

## Anomaly Detection

Statistical monitors run hourly and flag unusual patterns:

```python
class VolumeAnomalyDetector:
    """Flags when record count deviates > 3 standard deviations from 28-day rolling average."""

    def check(self, table: str, record_count: int, window_stats: WindowStats) -> DQResult:
        z_score = (record_count - window_stats.mean) / window_stats.std
        if abs(z_score) > 3.0:
            return DQResult.FAIL(
                f"{table}: {record_count} records — {z_score:.1f}σ deviation from {window_stats.mean:.0f} avg"
            )
        return DQResult.PASS
```

Currently monitored tables: `fact_payments`, `fact_user_events`, `cdc.payments.charges`

## Quality Gates

| Gate | Action on Failure |
|------|-----------------|
| Bronze → Silver | Block write, alert `#data-quality` Slack |
| Silver → Gold | Block publish, open auto-Jira ticket |
| Gold → BI Tools | Mark dashboard data stale, alert data on-call |

Data consumers are never served silently degraded data. Stale banners appear in Looker dashboards when checks fail.

## Data Quality Dashboard

Grafana dashboard: `https://grafana.internal/d/data-quality`

Tracks:
- Failed checks per pipeline per hour
- Null rates per critical column
- Deduplication rate
- Freshness lag per table

## Incident Process

When a DQ failure blocks a downstream consumer:

1. Data on-call gets paged (SEV2 if finance/exec consumer affected)
2. Root cause investigation: check ETL logs, CDC lag, upstream schema changes
3. Fix and re-run pipeline with `--reprocess-date YYYY-MM-DD`
4. Mark incident resolved in status page
5. Post-mortem if same pipeline fails twice in one month

## Related Documents

- ETL Pipeline Overview
- Data Warehouse Architecture
- Data Governance Policy
