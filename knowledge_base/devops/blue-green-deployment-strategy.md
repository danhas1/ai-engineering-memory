# Blue-Green Deployment Strategy

**Author:** Zoe Nguyen
**Team:** DevOps
**Last Updated:** 2025-11-20
**Tags:** blue-green, deployment, zero-downtime, canary, devops, kubernetes

## Overview

Blue-green deployments provide zero-downtime releases with instant rollback capability. We use this strategy for high-risk deployments (database schema changes, payment service updates, API breaking changes) where the default rolling update strategy carries too much risk.

## When to Use Blue-Green

**Use blue-green when:**
- Database migrations accompany the code change
- Breaking API changes are being introduced
- Payment service updates during peak hours
- Major dependency upgrades (runtime, framework)

**Use rolling update (default) when:**
- Routine feature changes
- Bug fixes with no schema changes
- Internal service changes with no public API impact

## Implementation with AWS ALB + Kubernetes

Blue-green is implemented using ALB weighted target groups:

```
AWS ALB
  │
  ├── Target Group BLUE (production pods, old version)
  │    Weight: 100% → 0% during cutover
  │
  └── Target Group GREEN (new pods, new version)
       Weight: 0% → 100% during cutover
```

Managed via the ALB ingress annotation and Kubernetes services:
- `payment-service-blue` → Deployment tagged `version=blue`
- `payment-service-green` → Deployment tagged `version=green`

## Deployment Procedure

### Step 1: Deploy Green (Zero Traffic)

```bash
# Deploy new version to green Deployment (no live traffic)
helm upgrade payment-service-green charts/payment-service \
  --namespace production \
  --set image.tag=<new-sha> \
  --set replicaCount=6 \
  --set service.name=payment-service-green \
  --wait --timeout 10m

# Verify green pods are healthy
kubectl get pods -l app=payment-service,version=green -n production
```

### Step 2: Smoke Test Green

```bash
# Port-forward directly to green service (bypasses ALB)
kubectl port-forward svc/payment-service-green 8081:8080 -n production &

# Run smoke tests against green
curl -X POST http://localhost:8081/api/v1/payment/charge \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -d '{"amount_cents": 100, "payment_method_id": "pm_test_xxx"}'
```

### Step 3: Gradual Traffic Shift

Shift traffic in steps, monitoring error rates after each shift:

```bash
# 10% to green
aws elbv2 modify-rule \
  --rule-arn $ALB_RULE_ARN \
  --actions Type=forward,ForwardConfig={TargetGroups=[{TargetGroupArn=$BLUE_TG,Weight=90},{TargetGroupArn=$GREEN_TG,Weight=10}]}

# Wait 5 minutes, check error rate
# 50% to green
# Wait 5 minutes
# 100% to green
```

### Step 4: Complete Cutover

```bash
# Final: all traffic to green
aws elbv2 modify-rule \
  --rule-arn $ALB_RULE_ARN \
  --actions Type=forward,TargetGroupArn=$GREEN_TG

echo "Cutover complete. Monitor for 10 minutes before decommissioning blue."
```

### Step 5: Decommission Blue (After Validation)

```bash
# Keep blue running for 30 minutes as rollback option
# After confirmation, scale down blue
helm uninstall payment-service-blue -n production
# Or: kubectl scale deployment payment-service-blue --replicas=0 -n production
```

## Instant Rollback

If green has issues:

```bash
# Instant rollback: shift all traffic back to blue
aws elbv2 modify-rule \
  --rule-arn $ALB_RULE_ARN \
  --actions Type=forward,TargetGroupArn=$BLUE_TG

# Keep green running for investigation
```

Rollback time: < 10 seconds (ALB weight update is instant).

## Canary Variant (1–5% Traffic)

For even more conservative rollout, shift only 1–5% to green for an hour before full cutover:

```bash
# 1% canary
aws elbv2 modify-rule ... Weight=99 (blue), Weight=1 (green)
# Monitor for 1 hour → if clean, proceed to full cutover
```

## Automation

The `scripts/blue-green-deploy.sh` script automates steps 1–5 with automatic rollback on error threshold breach:

```bash
./scripts/blue-green-deploy.sh \
  --service payment-service \
  --new-image-tag $SHA \
  --error-threshold 1.0 \
  --canary-step 10 \
  --canary-interval 300
```

## Related Documents

- CI/CD Pipeline Guide
- Deployment Rollback Runbook
- Incident Response Process
- Kubernetes Deployment Guide (Platform team)
