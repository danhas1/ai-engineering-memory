# Infrastructure Capacity Planning

**Author:** Lisa Park
**Team:** Platform
**Last Updated:** 2026-01-20
**Tags:** capacity-planning, karpenter, eks, scaling, cost, platform

## Overview

This document defines the platform team's approach to infrastructure capacity planning, node pool sizing, and proactive scaling decisions. Capacity reviews are conducted quarterly in sync with the business planning cycle.

## Capacity Planning Principles

1. **Right-size, don't over-provision.** We target 65–75% average CPU and memory utilization across node pools. Under-utilization above 40% triggers a review.
2. **Prefer horizontal scaling** over vertical scaling for stateless workloads.
3. **Karpenter handles burst.** Node pools provision on-demand for spikes; we plan for sustained baseline only.
4. **Cost is a metric.** We track cost per request alongside reliability metrics.

## Node Pool Sizing (Current Baseline)

| Pool | Instance Family | Purpose | On-Demand Min | Spot Max |
|------|----------------|---------|---------------|---------|
| `general` | m6i.xlarge | API services, light workers | 6 | 20 |
| `compute` | c6i.2xlarge | CPU-intensive workers | 2 | 15 |
| `memory` | r6i.2xlarge | Redis, stateful services | 2 | 0 (On-Demand only) |
| `gpu` | g4dn.xlarge | ML inference | 0 | 4 |

Karpenter `NodePool` manifests are in `infra/karpenter/nodepools/`. Changes require a platform team PR review.

## Traffic Forecasting

The planning model uses a 90-day rolling average with seasonal adjustment:

```
Projected RPS = current_p95_rps × (1 + growth_rate) × seasonal_multiplier
```

Current growth rate: **~12% month-over-month** (based on Q4 2025 actuals).

Seasonal multipliers applied:
- Black Friday / Cyber Monday: ×3.5
- End of quarter (payment volume): ×2.0
- Public holidays: ×0.6

## Scaling Headroom Policy

We maintain headroom of **30% above the projected peak** to accommodate:
- Unexpected traffic spikes
- Node provisioning latency (~90 seconds for new Karpenter nodes)
- Zone failure scenarios (1-AZ failover must not degrade service)

## Quarterly Review Process

Each quarter (January, April, July, October):

1. **Pull utilization data** from Datadog (90-day averages per service):
   ```bash
   datadog metric query \
     'avg:kubernetes.cpu.usage{env:production} by {service}' \
     --from "3 months ago" --to now
   ```

2. **Compare actual vs. projected** from prior quarter's plan.

3. **Adjust node pool limits** in Karpenter NodePools and HPA maxReplicas.

4. **Reserve capacity** for events (submit Reserved Instance or Savings Plan orders for baseline nodes ≥ 30 days before event).

5. **Publish updated plan** to `#infra-cost` Slack channel and Confluence capacity page.

## Cost Allocation

Each business unit is charged for their compute share via Kubecost tags. Cost allocation tags on pods:

```yaml
labels:
  cost-center: "payments"   # BU identifier
  team: "payments"
  env: "production"
```

Monthly cost reports are generated on the 3rd business day of each month and shared with VPs. Anomaly alerts fire when a service's weekly cost increases more than 25% week-over-week.

## Storage Capacity

| Store | Current Usage | Quota | Growth Rate |
|-------|--------------|-------|-------------|
| EBS (worker nodes) | 4.2 TB | 10 TB | ~8%/mo |
| S3 (logs + artifacts) | 82 TB | Unlimited | ~5%/mo |
| RDS PostgreSQL | 890 GB | 2 TB | ~3%/mo |
| ElastiCache Redis | 48 GB | 128 GB | ~12%/mo |

S3 Intelligent-Tiering is enabled on all buckets older than 30 days, reducing storage costs by ~35%.

## Alerts and Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Node pool utilization | >75% | >90% | Scale node pool max, review HPA |
| Spot interruption rate | >5%/day | >15%/day | Shift to On-Demand baseline |
| RDS storage free | <25% | <10% | Request storage increase ticket |
| ElastiCache memory | >80% | >90% | Scale cluster or evict stale keys |

## Related Documents

- ADR-003: Adopt Karpenter
- Platform SLO Policy
- Cost Optimization Guide (DevOps team)
- Kubernetes Deployment Guide
