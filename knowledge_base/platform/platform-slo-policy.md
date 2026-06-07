# Platform SLO Policy

**Author:** Sarah Chen
**Team:** Platform
**Last Updated:** 2026-01-01
**Tags:** slo, sla, reliability, uptime, platform, policy

## Overview

This document defines the Service Level Objectives (SLOs) for all platform-owned services. SLOs are measured over a rolling 28-day window and reviewed in the monthly Platform Engineering review meeting.

## SLO Definitions

### Availability SLOs

| Service | Availability Target | Error Budget (28d) |
|---------|--------------------|--------------------|
| API Gateway | 99.9% | 40.3 minutes |
| EKS Control Plane | 99.95% | 20.2 minutes |
| Redis Cluster | 99.9% | 40.3 minutes |
| Internal Load Balancers | 99.95% | 20.2 minutes |

### Latency SLOs

| Service | p50 Target | p95 Target | p99 Target |
|---------|-----------|-----------|-----------|
| API Gateway (pass-through) | < 10ms | < 50ms | < 200ms |
| Redis GET/SET | < 1ms | < 5ms | < 20ms |

### Error Rate SLOs

| Service | Error Rate Target |
|---------|-----------------|
| API Gateway (5xx) | < 0.1% |
| EKS pod scheduling | < 0.5% pod scheduling failures |

## Error Budget Policy

When 50% of the monthly error budget is consumed:
- Freeze non-critical changes to the affected service
- Platform team lead is notified automatically via Datadog monitor
- Daily error budget burn report emailed to team

When 100% of the monthly error budget is consumed:
- All changes to the service require VP Engineering approval
- Incident review required before changes resume
- Customer SLA credits may be triggered (per customer contracts)

## Measurement

### Availability

Availability is measured as:
```
Availability = (total_minutes - downtime_minutes) / total_minutes × 100
```

Downtime is defined as any 1-minute window where error rate > 10% OR the service fails its synthetic health check.

### Latency

Latency percentiles are calculated from Datadog APM trace data with a 1-minute evaluation window. p99 SLO violations require 3 consecutive breaches to open an error budget window.

## Monitoring and Alerting

All SLOs are tracked in Datadog SLO dashboards. Alert thresholds:

| Burn Rate | Alert Severity | Notification |
|-----------|---------------|-------------|
| 5× over 1 hour | SEV2 | PagerDuty on-call |
| 2× over 6 hours | SEV3 | Slack #platform-oncall |
| 1× over 24 hours | SEV4 | Email to team lead |

SLO dashboards: `https://app.datadoghq.com/slo` (filter: team:platform)

## Exclusions

The following events do not count against the SLO error budget:
- Planned maintenance windows (> 72 hours notice via status page)
- AWS infrastructure force-majeure events declared by AWS Health
- Failures caused by upstream services outside platform ownership

## Review and Update Cadence

SLO targets are reviewed annually. Upward revisions (tighter targets) require a 90-day observation period to confirm the tighter SLO is achievable before it becomes contractually binding.

## Related Documents

- Multi-Region Failover Architecture
- Infrastructure Capacity Planning
- Kubernetes Deployment Guide
- Monitoring and Alerting Guide (DevOps team)
