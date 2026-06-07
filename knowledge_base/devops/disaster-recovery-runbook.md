# Disaster Recovery Runbook

**Author:** Chris Walsh
**Team:** DevOps
**Last Updated:** 2026-01-10
**Tags:** disaster-recovery, dr, runbook, aws, failover, devops

## Overview

This runbook covers the steps to execute a full or partial disaster recovery (DR) failover when the primary AWS region (`us-east-1`) is unavailable. The DR region is `us-west-2`.

**RTO (Recovery Time Objective):** 15 minutes  
**RPO (Recovery Point Objective):** 5 minutes (transactional data), 15 minutes (analytics)

This runbook complements the Multi-Region Failover Architecture document (Platform team) and provides the step-by-step execution guide for the on-call engineer.

## DR Activation Criteria

Activate DR only when ALL of the following are true:
1. `us-east-1` is confirmed unavailable (not just one AZ)
2. AWS Health Dashboard shows a regional service event in `us-east-1`
3. At least two independent monitoring sources confirm the outage
4. VP Engineering has authorized the failover

Do NOT activate DR for single-AZ failures — EKS and RDS Multi-AZ handle those automatically.

## Pre-Failover Checks (5 minutes)

```bash
# Verify AWS us-east-1 status
aws health describe-events \
  --filter services=["AMAZON_EKS","AMAZON_RDS"] \
  --region us-east-1

# Check DR cluster health
kubectl get nodes --context eks-prod-dr
kubectl get pods -n production --context eks-prod-dr

# Verify RDS replica replication status
aws rds describe-db-instances \
  --db-instance-identifier acme-prod-db-us-west-2 \
  --region us-west-2 \
  --query 'DBInstances[0].{Status:DBInstanceStatus,Lag:ReadReplicaDBInstanceIdentifiers}'
```

## Failover Execution

### Phase 1: DNS Cutover (Minutes 0–5)

```bash
# Update Route 53 to point to us-west-2 ALB
# Use the pre-staged changeset
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://scripts/dr/dns-failover-to-west2.json

# Monitor DNS propagation
watch -n 10 "dig +short api.acmecorp.com"
# Should resolve to us-west-2 ALB IP within 60 seconds (TTL=60)
```

### Phase 2: Database Promotion (Minutes 3–12)

```bash
# Promote read replica to standalone primary
aws rds promote-read-replica \
  --db-instance-identifier acme-prod-db-us-west-2 \
  --region us-west-2

# Wait for promotion (typically 5–8 minutes)
aws rds wait db-instance-available \
  --db-instance-identifier acme-prod-db-us-west-2 \
  --region us-west-2

echo "DB promotion complete. Endpoint: $(aws rds describe-db-instances \
  --db-instance-identifier acme-prod-db-us-west-2 --region us-west-2 \
  --query 'DBInstances[0].Endpoint.Address' --output text)"
```

### Phase 3: Application Startup in DR (Minutes 8–15)

```bash
# Update DB connection secret in DR region
NEW_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier acme-prod-db-us-west-2 --region us-west-2 \
  --query 'DBInstances[0].Endpoint.Address' --output text)

aws secretsmanager put-secret-value \
  --secret-id production/db-url \
  --secret-string "postgresql://${NEW_ENDPOINT}/acme" \
  --region us-west-2

# Rolling restart to pick up new DB connection
kubectl rollout restart deployment -n production --context eks-prod-dr

# Wait for rollout to complete
kubectl rollout status deployment/payment-service \
  -n production --context eks-prod-dr --timeout=10m
```

### Phase 4: Verify DR Health (Minutes 13–15)

```bash
# Check all deployments are running
kubectl get deployments -n production --context eks-prod-dr

# Run smoke tests
curl -sf https://api.acmecorp.com/health
curl -sf https://api.acmecorp.com/api/v1/user/health

# Verify payment flow (test environment)
python scripts/smoke_tests.py --env dr --suite payment_flow

# Check error rates in Datadog
# Dashboard: https://app.datadoghq.com/dashboard/production-services
```

## Communication During DR

Update the status page immediately:
```
Incident title: Regional infrastructure issue
Status: Investigating
Update: We are aware of an issue affecting our services and are actively working to restore service.
```

Once DR is active:
```
Status: Monitoring
Update: Services have been restored via our disaster recovery infrastructure. We continue to monitor for stability.
```

## Failback to us-east-1

Once `us-east-1` is confirmed healthy:

1. Verify `us-east-1` infrastructure is fully operational
2. Set up replication from `us-west-2` (DR) → `us-east-1` (primary)
3. Wait for replication lag < 1 minute
4. Gradually shift Route 53 weight: 10% → 30% → 70% → 100% (30-minute intervals)
5. Scale down DR services to standby levels
6. Document the incident in the post-mortem template

## DR Drill Schedule

| Drill Type | Frequency | Lead | Last Completed |
|-----------|-----------|------|---------------|
| Tabletop exercise | Quarterly | Zoe Nguyen | 2025-10-15 |
| DNS-only failover test | Semi-annual | Chris Walsh | 2025-09-01 |
| Full DR activation | Annual | VP Engineering | 2025-06-15 |

## Related Documents

- Multi-Region Failover Architecture (Platform team)
- Incident Response Process
- Monitoring and Alerting Guide
- Deployment Rollback Runbook
