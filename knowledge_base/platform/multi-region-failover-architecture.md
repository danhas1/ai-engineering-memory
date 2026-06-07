# Multi-Region Failover Architecture

**Author:** Jake Morrison
**Team:** Platform
**Last Updated:** 2026-02-05
**Tags:** multi-region, failover, disaster-recovery, architecture, aws, platform

## Overview

This document describes the multi-region failover architecture for production workloads. The primary region is `us-east-1`; the DR region is `us-west-2`. The target RTO is 15 minutes for full regional failover and RPO of 5 minutes for transactional data.

## Architecture

```
┌─────────────────────────────────┐    ┌──────────────────────────────────┐
│  us-east-1 (PRIMARY)            │    │  us-west-2 (DR)                  │
│                                 │    │                                  │
│  Route 53 (Active)              │◄──►│  Route 53 (Standby)             │
│  ALB → EKS (eks-prod-primary)   │    │  ALB → EKS (eks-prod-dr)        │
│  RDS PostgreSQL (Multi-AZ)      │    │  RDS PostgreSQL (Read Replica)  │
│  ElastiCache Redis (Sentinel)   │    │  ElastiCache (Rebuild on fail)  │
│  S3 (Origin)                    │    │  S3 (CRR destination)           │
└─────────────────────────────────┘    └──────────────────────────────────┘
```

## Data Replication

### PostgreSQL

RDS Multi-AZ provides synchronous replication within `us-east-1`. A read replica in `us-west-2` is promoted during failover.

Replication lag target: **< 5 seconds** (monitored via CloudWatch `ReplicaLag` metric).

Promotion procedure:
```bash
aws rds promote-read-replica \
  --db-instance-identifier acme-prod-db-us-west-2 \
  --region us-west-2
# Expect ~5 min for promotion to complete
```

### S3

Cross-Region Replication (CRR) is enabled for all production buckets. Replication lag is typically < 15 minutes. Status can be checked via S3 Replication Metrics in CloudWatch.

### Redis

Redis is not replicated cross-region (it is a cache layer). On DR failover, services start with cold caches. The cache warm-up period causes elevated database load for approximately 10–15 minutes. Pre-warming scripts are available at `scripts/cache-warmup.sh`.

## Failover Trigger Criteria

Failover should be initiated when **all three conditions** are met:

1. `us-east-1` ALB health check fails for > 3 consecutive minutes
2. At least 2 independent monitors (PagerDuty + CloudWatch Synthetics) confirm the outage
3. VP Engineering or on-call SRE Lead authorizes the failover

Single-AZ failures within `us-east-1` do **not** trigger multi-region failover — EKS and RDS Multi-AZ handle those automatically.

## Failover Runbook

### Phase 1: Preparation (0–5 minutes)

```bash
# Confirm primary region health
aws route53 get-health-check-status --health-check-id <prod-hc-id>

# Verify DR cluster readiness
kubectl get nodes --context eks-prod-dr
kubectl get deployments -n production --context eks-prod-dr
```

### Phase 2: Traffic Cutover (5–10 minutes)

```bash
# Update Route 53 weighted routing: set primary weight to 0
aws route53 change-resource-record-sets \
  --hosted-zone-id <zone-id> \
  --change-batch file://scripts/dr-failover-dns.json

# Verify DNS propagation (~60 seconds for TTL=60 policy)
watch -n 5 "dig api.acmecorp.com +short"
```

### Phase 3: DB Promotion (10–15 minutes)

```bash
# Promote read replica to standalone
aws rds promote-read-replica \
  --db-instance-identifier acme-prod-db-us-west-2 --region us-west-2

# Update application DB connection string in Secrets Manager (DR region)
aws secretsmanager put-secret-value \
  --secret-id production/db-url \
  --secret-string "postgresql://prod-db-us-west-2.rds.amazonaws.com/acme" \
  --region us-west-2

# Rolling restart pods to pick up new DB URL
kubectl rollout restart deployment -n production --context eks-prod-dr
```

## Failback Procedure

After the primary region is restored:

1. Bring `us-east-1` RDS back in sync (set up replication from DR → primary)
2. Verify application health in `us-east-1`
3. Gradually shift Route 53 weight back: 10% → 50% → 100% over 30 minutes
4. Decommission DR as primary

## Regular DR Drills

Tabletop DR drills are conducted quarterly. Actual partial failover tests (traffic only, without DB promotion) run twice yearly. Results are published to `#platform-eng` within 48 hours.

## Related Documents

- Platform SLO Policy
- Disaster Recovery Runbook (DevOps team)
- Infrastructure Capacity Planning
- Redis Failover Runbook
