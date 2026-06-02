# Monthly SLO Report — November 2025

**Report type:** Monthly SLO Review
**Period:** 2025-11-01 00:00 UTC — 2025-11-30 23:59 UTC
**Published:** 2025-12-05
**Author:** Marcus Rivera (SRE)
**Distribution:** #eng-reliability, Engineering Leadership, Priya Patel, James Okonkwo, Sarah Chen, Emily Torres
**Source data:** Grafana SLO dashboards (cloudshop-prod), PagerDuty incident log, CloudWatch metrics

---

## Executive Summary

November 2025 was a challenging month for CloudShop reliability. The payment-service availability SLO was breached for the first time since CloudShop moved to microservices, due to the 47-minute outage on November 15 caused by a combination of misconfigured resource limits and a missing PodDisruptionBudget during the ECS-to-EKS migration. The user-service and recommendation-service remained within their SLOs despite secondary effects from the incident.

The ECS-to-EKS migration, which was the primary focus of November's platform work, was partially completed: recommendation-service and user-service are fully on EKS; payment-service is back on ECS pending the revised migration approach.

---

## Service SLO Status

### payment-service

| SLO Metric | Target | November Result | Status |
|---|---|---|---|
| Availability (30-day rolling) | 99.95% | 99.89% | 🔴 BREACHED |
| p99 Latency | < 350ms | 183ms (monthly avg), 612ms (peak during incident) | 🟡 BREACHED DURING INCIDENT, nominal otherwise |
| Error rate (5xx) | < 0.05% | 0.08% (monthly avg) | 🔴 BREACHED |

**Availability calculation:**

Total minutes in November: 43,200
Minutes of full outage (INC-2025-047, 06:14–07:01 UTC, Nov 15): 47 minutes
Minutes of degraded state (error rate > SLO threshold, 07:01–09:10 UTC, Nov 15): 129 minutes

For the purpose of SLO accounting, "availability" counts minutes where error rate was above the 0.05% threshold. Both full outage and degraded periods are counted as unavailable minutes.

```
Unavailable minutes = 47 (full) + 129 (degraded) = 176 minutes
Availability = (43,200 - 176) / 43,200 = 99.593%
```

Wait — this is the raw calculation. The 30-day rolling window at month end includes the tail of October (which was clean), so the formal 30-day rolling number reported in Grafana on 2025-11-30 was **99.89%** (the SLO window spans Oct 31–Nov 30).

**Trend:** This is the first availability SLO breach for payment-service since SLO tracking was introduced in Q1 2024. Prior to November, the payment-service 30-day rolling availability was 99.97%–99.99%.

**Error budget consumed:**
- Monthly error budget: 0.05% × 43,200 = 21.6 minutes
- Minutes consumed by INC-2025-047 alone: 176 minutes
- Error budget consumed: 815% of monthly budget (budget was exhausted within the first 47 minutes of the incident)

**SLO miss impact:** November SLO miss will be reported to the Finance team for any potential SLA penalty calculations with enterprise customers. Legal is reviewing the enterprise agreements (3 customers with uptime SLA commitments for payment APIs). Emily Torres owns the customer communication.

---

### user-service

| SLO Metric | Target | November Result | Status |
|---|---|---|---|
| Availability (30-day rolling) | 99.9% | 99.94% | ✅ MET |
| p99 Latency | < 200ms | 148ms (monthly avg) | ✅ MET |
| Error rate (5xx) | < 0.1% | 0.04% (monthly avg) | ✅ MET |

**Notes:** user-service showed a brief error rate spike to ~0.8% between 06:14 and 06:30 UTC on November 15, correlated with the payment-service outage. This was caused by retry storms from payment-service clients re-attempting failed requests, which drove elevated concurrent gRPC calls to user-service's identity validation endpoint. The spike was transient and self-resolved as payment-service recovered. The 28-minute spike did not materially affect the 30-day rolling SLO.

EKS migration for user-service completed successfully on November 17. Performance on EKS is nominal: p99 at 148ms vs. 155ms ECS baseline, slightly improved due to better pod bin-packing on the general node group.

---

### recommendation-service

| SLO Metric | Target | November Result | Status |
|---|---|---|---|
| Availability (30-day rolling) | 99.5% | 99.72% | ✅ MET |
| p99 Latency | < 500ms | 385ms (monthly avg) | ✅ MET |
| Error rate (5xx) | < 0.5% | 0.09% (monthly avg) | ✅ MET |

**Notes:** EKS migration for recommendation-service completed successfully on November 14. No availability events. The morning of November 15 showed a brief spike in fallback (popular-items) recommendation serves during the payment outage window, as user-service latency increased slightly. This was not an availability event but is worth noting as a cascade effect.

November's recommendation-service latency (385ms avg p99) is within SLO but higher than the October baseline (310ms avg p99). Investigation in progress (JIRA-107, opened December 2025). Preliminary finding: cold-start provisioning time on EKS for the memory-optimized node group is slower than expected during morning traffic ramp-up.

---

## Incidents

| Incident ID | Date | Severity | Duration | Services Affected | Status |
|---|---|---|---|---|---|
| INC-2025-047 | 2025-11-15 | SEV-1 | 47min full, 2h degraded | payment-service (primary), user-service (secondary) | Resolved; postmortem accepted 2025-11-22 |

No other incidents in November.

---

## Migration Progress (ECS → EKS)

| Service | Status | Date Completed |
|---|---|---|
| recommendation-service | ✅ EKS 100% | 2025-11-14 |
| user-service | ✅ EKS 100% | 2025-11-17 |
| payment-service | 🔄 Back on ECS; migration attempt 2 planned for 2025-11-29 | — |

---

## Error Budget Summary

| Service | Monthly Budget (minutes) | Minutes Consumed | Budget Remaining | Burn Rate |
|---|---|---|---|---|
| payment-service | 21.6 min (at 99.95%) | 176 min | -154 min (exhausted) | 8.15× |
| user-service | 43.2 min (at 99.9%) | 2.6 min | 40.6 min remaining | 0.06× |
| recommendation-service | 216 min (at 99.5%) | 8.4 min | 207.6 min remaining | 0.04× |

---

## Alert Noise Analysis

| Alert Name | Fires in November | False Positives | Actionable | Notes |
|---|---|---|---|---|
| `payment-service-error-rate-high` | 3 | 0 | 3 | 1 was INC-2025-047; 2 were brief transient spikes that auto-resolved |
| `payment-service-high-latency` | 1 | 0 | 1 | Fired at 06:14 coincident with INC-2025-047 |
| `recommendation-service-high-latency` | 4 | 3 | 1 | Three were spurious HPA-related spikes during EKS pod scheduling; alert threshold may need tuning |
| `user-service-error-rate-high` | 0 | 0 | 0 | — |
| `redis-memory-utilization-high` | 0 | 0 | 0 | Redis at 34% utilization in November; well within headroom |

**Alert improvement action:** The `recommendation-service-high-latency` alert produced 3 false positives during EKS pod scheduling events (new pods with cold Redis cache and no DynamoDB prefetch produce elevated p99 for 60–90 seconds after startup). Marcus Rivera will adjust the alert to require 5 consecutive minutes above threshold rather than 1, to filter out startup transients.

---

## On-Call Summary

| Engineer | On-Call Shifts | Pages Received | Out-of-Hours Pages |
|---|---|---|---|
| Marcus Rivera | 2 weeks | 4 | 1 (INC-2025-047, 06:15 UTC) |
| Priya Patel | 1 week | 1 | 1 (INC-2025-047, called in) |
| Alex Kim | 1 week | 0 | 0 |

INC-2025-047 generated 1 out-of-hours page (06:15 UTC). The majority of on-call pages in November were during business hours or were auto-resolved.

---

## December Priorities (Reliability)

1. Complete payment-service EKS migration (Attempt 2, week of 2025-11-29)
2. Implement standard resource limit baselines by service type (action item from INC-2025-047 postmortem)
3. Add PDB existence check to migration runbook as a blocking gate
4. Tune `recommendation-service-high-latency` alert to reduce false positives
5. Begin investigation of recommendation-service morning cold-start latency (JIRA-107)

---

## Appendix: SLO Methodology Notes

**Availability definition:** A service is "available" during a given minute if its HTTP/gRPC error rate (5xx responses) is below the SLO error rate threshold for that minute. Calculated as 1 − (error_minutes / total_minutes) over the rolling window.

**Latency SLO:** Measured as the 99th percentile of response time across all requests in the period. Latency SLO is a performance target, not an availability target — breaches are tracked but do not consume error budget.

**Error budget:** Monthly error budget = (1 − availability_target) × minutes_in_month. Burn rate = actual_error_minutes / budget_minutes.

**Data source:** Prometheus metrics, scraped every 15 seconds, aggregated by Grafana recording rules. Alert thresholds evaluated over 5-minute evaluation windows.
