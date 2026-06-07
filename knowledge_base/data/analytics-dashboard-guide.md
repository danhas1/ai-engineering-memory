# Analytics Dashboard Guide

**Author:** Nina Kowalski
**Team:** Data
**Last Updated:** 2026-01-10
**Tags:** analytics, dashboards, looker, bi, reporting, metrics

## Overview

This guide covers the analytics dashboard platform (Looker + Redshift), standard metric definitions, access management, and best practices for building reliable dashboards consumed by business stakeholders.

## Dashboard Platform

All company dashboards are built in **Looker** (SaaS, integrated with Redshift via the `acme-dw` connection).

**Looker URL:** `https://acme.cloud.looker.com`

Access is granted via Okta SSO. Role assignment:
- `Viewer` — can view dashboards, download data
- `Explorer` — can run Explore queries, create Looks
- `Developer` — can write LookML, create Explores, manage fields
- `Admin` — full platform access (Data team only)

## Core Dashboards

| Dashboard | Owner | Audience | Refresh |
|-----------|-------|----------|---------|
| Revenue Overview | Nina Kowalski | Finance, VP | Hourly |
| Daily Active Users | Nina Kowalski | Product | Hourly |
| Payment Health | Diana Chen | Payments team | 15 min |
| Customer Cohorts | Ryan O'Brien | Growth | Daily |
| Infrastructure Cost | Diana Chen | Platform team | Daily |
| SLO Burn Rate | Ryan O'Brien | Engineering | Real-time |

## Canonical Metric Definitions

All metrics in Looker are defined in LookML. Do not create ad-hoc calculated fields that diverge from these definitions.

### Revenue Metrics

```lookml
measure: gross_revenue_usd {
  type: sum
  sql: ${fact_payments.amount_usd} ;;
  value_format_name: usd
}

measure: net_revenue_usd {
  type: sum
  sql: ${fact_payments.amount_usd} - ${fact_payments.refund_amount_usd} ;;
  value_format_name: usd
}

measure: mrr {
  description: "Monthly Recurring Revenue — subscription charges only"
  type: sum
  sql: CASE WHEN ${fact_payments.is_subscription} THEN ${fact_payments.amount_usd} ELSE 0 END ;;
  value_format_name: usd
}
```

### User Metrics

```lookml
measure: dau {
  description: "Daily Active Users — users with at least one session event"
  type: count_distinct
  sql: ${fact_user_events.customer_id} ;;
}

measure: retention_rate_28d {
  description: "% of users active in week 4 who were active in week 1"
  type: number
  sql: ${agg_weekly_cohorts.week4_users} / NULLIF(${agg_weekly_cohorts.week1_users}, 0) * 100 ;;
  value_format_name: percent_1
}
```

## Building New Dashboards

### Checklist

- [ ] Metric definitions reviewed by data team lead
- [ ] Data freshness indicator added to dashboard header
- [ ] Dashboard description field filled out
- [ ] Scheduled PDF delivery configured (if finance/exec audience)
- [ ] Access permissions set to minimum required audience
- [ ] Performance tested: all tiles load in < 5 seconds (use `agg_` tables where possible)

### LookML Development Workflow

1. Branch from `main` in the Looker IDE
2. Make changes, test in Explore
3. Open a PR against `main` in the connected GitHub repo (`acme-lookml`)
4. Data team lead reviews and merges
5. Production deployment is automatic after merge

## Dashboard Refresh Schedule

Looker PDT (Persistent Derived Tables) are pre-computed on schedule:

| PDT | Trigger | Cost |
|-----|---------|------|
| `pdts_cohort_analysis` | Daily 01:00 UTC | High |
| `pdts_ltv_model` | Weekly Sunday | High |
| `pdts_funnel_steps` | Every 4 hours | Medium |

Avoid triggering large PDTs during business hours — they compete with analyst queries on the Redshift WLM `reports` queue.

## Alerting on Metrics

Looker Alerts can trigger when a metric crosses a threshold:

```
Revenue dropped > 20% vs prior day → Slack #exec-alerts + email Finance
DAU dropped > 15% vs prior day → Slack #product
Payment error rate > 1% → PagerDuty (payment on-call)
```

Configure alerts in Looker: three-dot menu on a tile → Create Alert.

## Data Freshness SLA

| Metric Type | Max Staleness |
|-------------|--------------|
| Revenue totals | 1 hour |
| User activity | 1 hour |
| Payment health | 15 minutes |
| Cohort analysis | 24 hours |

If a dashboard is stale beyond its SLA, the data team on-call is paged.

## Related Documents

- Data Warehouse Architecture
- ETL Pipeline Overview
- Real-Time Streaming Pipeline Guide
