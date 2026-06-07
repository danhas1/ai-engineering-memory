# Redis Failover Runbook

**Author:** Jake Morrison
**Team:** Platform
**Last Updated:** 2026-01-14
**Tags:** redis, failover, runbook, high-availability, cache

## Overview

This runbook covers detection, response, and recovery procedures for Redis failover events in production. The platform team operates a Redis Sentinel cluster (3 nodes: 1 primary, 2 replicas) across availability zones us-east-1a, us-east-1b, and us-east-1c.

## SLO Impact

- **Cache hit degradation** acceptable for up to 5 minutes before fallback to database reads begins impacting overall p99 latency.
- **Target RTO:** < 4 minutes for automatic Sentinel failover; < 15 minutes for manual intervention.
- **Target RPO:** 0 (Redis is a cache layer; no data persistence requirement).

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Redis Sentinel Cluster                          │
│                                                  │
│  Primary: redis-primary.internal:6379            │
│  Replica 1: redis-replica-1a.internal:6379       │
│  Replica 2: redis-replica-1b.internal:6379       │
│                                                  │
│  Sentinel 1: redis-sentinel-1.internal:26379     │
│  Sentinel 2: redis-sentinel-2.internal:26379     │
│  Sentinel 3: redis-sentinel-3.internal:26379     │
└──────────────────────────────────────────────────┘
```

Application clients connect via the Sentinel endpoint. Sentinel handles automatic primary election when the primary fails a configurable quorum health check.

## Failure Detection

### Automatic Alerting

Alerts fire on PagerDuty when:

1. `redis_sentinel_ok` metric drops below 1 for more than 60 seconds
2. `redis_connected_slaves` < 1 for more than 90 seconds
3. `redis_replication_lag_seconds` > 30 for either replica

### Manual Detection

```bash
# Check sentinel status
redis-cli -h redis-sentinel-1.internal -p 26379 SENTINEL masters

# Check primary reachability
redis-cli -h redis-primary.internal -p 6379 PING

# Check replication state on replica
redis-cli -h redis-replica-1a.internal -p 6379 INFO replication
```

## Response Procedure

### Step 1: Assess Scope (2 minutes)

```bash
# Identify which nodes are alive
for host in redis-primary redis-replica-1a redis-replica-1b; do
  echo -n "$host: "; redis-cli -h ${host}.internal -p 6379 PING 2>&1
done

# Check which node Sentinel considers primary
redis-cli -h redis-sentinel-1.internal -p 26379 SENTINEL get-master-addr-by-name mymaster
```

### Step 2: Verify Sentinel Convergence (1 minute)

If primary is down, Sentinel should begin failover automatically once quorum (2 of 3 sentinels) agrees. Check progress:

```bash
# Watch for failover events
redis-cli -h redis-sentinel-1.internal -p 26379 SENTINEL masters | grep -A 5 "name"
```

If `flags` field shows `master` and `odown` (objectively down), Sentinel is in the process of electing a new primary.

### Step 3: Confirm Automatic Failover

```bash
# Should return new primary IP within 4 minutes
redis-cli -h redis-sentinel-1.internal -p 26379 SENTINEL get-master-addr-by-name mymaster

# Verify application is connecting to new primary
kubectl logs -l app=payment-service -n production --tail=50 | grep "redis"
```

### Step 4: Manual Failover (if Sentinel fails to converge)

Use this only if automatic failover has not completed within 4 minutes:

```bash
# Force Sentinel to initiate failover
redis-cli -h redis-sentinel-1.internal -p 26379 SENTINEL failover mymaster
```

### Step 5: Rebuild Failed Node

Once the original primary recovers, it will join as a replica automatically. Verify:

```bash
redis-cli -h <recovered-host>:6379 INFO replication | grep role
# Expected: role:slave
```

## Post-Failover Validation

```bash
# Smoke test cache writes/reads from a pod
kubectl exec -it <any-service-pod> -n production -- \
  redis-cli -h redis-primary.internal SET test_key test_val EX 30
kubectl exec -it <any-service-pod> -n production -- \
  redis-cli -h redis-primary.internal GET test_key
```

Expected output: `test_val`

## Common Failure Modes

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| All 3 sentinels unreachable | Network partition or AZ outage | Escalate to on-call SRE + network team |
| Sentinel stuck in `sdown` (subjectively down) | Single sentinel connectivity issue | Restart affected sentinel pod |
| Replica lag > 60s | High write volume or network congestion | Monitor; add bandwidth cap to replica sync |
| OOM on primary | Large key eviction storm | Review `maxmemory-policy`; check for key size regressions |

## Escalation

- **Tier 1 (on-call SRE):** Automatic PagerDuty page
- **Tier 2 (Platform Team):** Slack #platform-oncall
- **Tier 3 (Jake Morrison / Lisa Park):** Direct page after 10 minutes without resolution

## Related Documents

- ADR-002: Adopt Redis for Payment Service Caching
- Platform SLO Policy
- Multi-Region Failover Architecture
