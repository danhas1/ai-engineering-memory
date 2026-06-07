# Incident Response Process

**Author:** Zoe Nguyen
**Team:** DevOps
**Last Updated:** 2026-01-12
**Tags:** incident-response, oncall, pagerduty, sre, runbook, devops

## Overview

This document defines the incident response process: how incidents are detected, triaged, escalated, and resolved. Every engineer who is on-call must be familiar with these procedures.

## Severity Definitions

| Severity | Impact | Response Time | Example |
|----------|--------|--------------|---------|
| SEV1 | Customer-facing outage, 0% availability | Immediate (< 5 min) | Payment service down |
| SEV2 | Significant degradation, >20% error rate | < 15 minutes | Checkout failing for 20% of users |
| SEV3 | Minor degradation, <5% users impacted | < 1 hour | Slow checkout in EU region |
| SEV4 | Non-customer-impacting anomaly | Business hours | Elevated DB query time (no user impact) |

## On-Call Rotation

All engineers join the on-call rotation after 3 months on the team. Rotation managed in PagerDuty.

**Escalation policy:**
1. Primary on-call (immediate page)
2. Secondary on-call (if no response in 5 min)
3. Team Lead (if no response in 10 min)
4. VP Engineering (SEV1 only, after 15 min)

## Incident Lifecycle

### 1. Detection (Automated or Manual)

Automated detection via:
- PagerDuty + Datadog monitors
- Synthetic checks (Checkly, every 60 seconds)
- CloudWatch alarms

Manual reports via:
- Customer support tickets
- Internal Slack messages in `#incidents`

### 2. Triage (First 5 minutes)

On receiving a page:

```
1. Acknowledge the alert in PagerDuty (prevents escalation)
2. Open the incident Slack channel: /incident start "short description"
3. Check the monitoring dashboard for the affected service
4. Determine severity (use the table above)
5. Post initial assessment in the incident channel
```

### 3. Declare and Communicate

For SEV1/SEV2:
- Post in `#incidents` immediately: "SEV1 declared: <service> is down. IC: @handle. Bridge: <zoom-link>"
- Update status page at `https://status.acmecorp.com` within 5 minutes
- Notify VP Engineering for SEV1

Roles in a major incident:
- **Incident Commander (IC):** Coordinates response, owns communication
- **Technical Lead:** Drives investigation and fix
- **Communications Lead:** Updates customers and stakeholders

### 4. Investigate

Common first steps:
```bash
# Check pod health
kubectl get pods -n production -l app=<service>

# Recent errors
kubectl logs -l app=<service> -n production --since=15m | grep ERROR

# Rollout history (did we deploy recently?)
kubectl rollout history deployment/<service> -n production

# Check Datadog for error rate spike
# Dashboard: https://app.datadoghq.com/dashboard/production-services
```

### 5. Mitigate

Mitigation options (in order of preference):
1. **Rollback** the most recent deployment (fastest if deploy caused it)
2. **Scale up** if the issue is load-related
3. **Feature flag off** if a new feature is causing errors
4. **Circuit break** traffic away from the failing component

```bash
# Quick rollback
helm rollback <service> 0 -n production --wait

# Scale up
kubectl scale deployment <service> --replicas=10 -n production
```

### 6. Resolve and Close

Once metrics return to baseline for > 10 minutes:
1. Confirm via Datadog that error rate, latency, and success rate are nominal
2. Update the status page: "Incident resolved at HH:MM UTC"
3. Close the incident in PagerDuty
4. Post resolution summary in the incident channel
5. Schedule a post-mortem within 5 business days

## Post-Mortem Process

Post-mortems are blameless. The goal is to improve systems, not assign blame.

**Template:** `docs/templates/postmortem.md`

Required sections:
- Timeline of events
- Root cause analysis (5 Whys)
- Customer impact
- What went well
- What went wrong
- Action items with owners and due dates

Post-mortems for SEV1 are reviewed by the Engineering VP and published to the internal wiki.

## On-Call Handbook

Key bookmarks for on-call:
- Datadog dashboards: `https://app.datadoghq.com/dashboard/production-services`
- Runbooks index: `https://wiki.internal/runbooks`
- PagerDuty escalation: `https://acme.pagerduty.com`
- Status page admin: `https://statuspage.internal`
- ArgoCD: `https://argocd.internal`

## Related Documents

- Monitoring and Alerting Guide
- Deployment Rollback Runbook
- CI/CD Pipeline Guide
- Redis Failover Runbook (Platform team)
