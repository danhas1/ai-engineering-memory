# Kubernetes Deployment Guide

**Author:** Sarah Chen
**Team:** Platform
**Last Updated:** 2026-02-01
**Tags:** kubernetes, deployment, eks, containers, helm, platform

## Overview

This guide covers the standard deployment workflow for all services running on our EKS clusters. All production services must follow these procedures to ensure safe, auditable rollouts with zero-downtime guarantees.

## Cluster Topology

We operate three EKS clusters:

| Cluster | Purpose | Region | Node Pools |
|---------|---------|--------|------------|
| `eks-prod-primary` | Production workloads | us-east-1 | general, compute, memory |
| `eks-prod-dr` | Disaster recovery (warm standby) | us-west-2 | general |
| `eks-staging` | Pre-production validation | us-east-1 | general |

All clusters run Kubernetes 1.30. Node provisioning is managed by Karpenter.

## Deployment Prerequisites

1. **Docker image** tagged with the git SHA: `<ecr-registry>/<service>:<git-sha>`
2. **Helm chart** version bumped in `charts/<service>/Chart.yaml`
3. **Smoke tests** passing in staging for the target image
4. **Change ticket** created in Jira and linked in the PR

## Standard Deployment Procedure

### 1. Validate Image in Staging

```bash
# Deploy to staging first
helm upgrade --install <service> charts/<service> \
  --namespace staging \
  --set image.tag=<git-sha> \
  --set replicaCount=2 \
  --wait --timeout 5m

# Run smoke tests
kubectl run smoke-test --image=<ecr-registry>/smoke-tests:<version> \
  --namespace staging --restart=Never -- /tests/smoke.sh <service>
kubectl wait --for=condition=complete job/smoke-test --timeout=120s -n staging
```

### 2. Production Rollout (Rolling Update)

All production deployments use a rolling update strategy with the following safeguards:

```yaml
# Enforced in all service Helm charts
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
```

```bash
helm upgrade <service> charts/<service> \
  --namespace production \
  --set image.tag=<git-sha> \
  --atomic \          # auto-rollback if rollout fails
  --timeout 10m \
  --wait
```

### 3. Verify Rollout Health

```bash
# Watch pod rollout
kubectl rollout status deployment/<service> -n production

# Check pod resource usage
kubectl top pods -l app=<service> -n production

# Verify no CrashLoopBackOff
kubectl get pods -l app=<service> -n production -w
```

### 4. Post-Deploy Smoke Test

```bash
# Hit the service health endpoint
kubectl exec -it deploy/<any-other-service> -n production -- \
  curl -sf http://<service>.production.svc.cluster.local/health

# Check error rate in Datadog for 5 minutes post-deploy
# Dashboard: https://app.datadoghq.com/dashboard/production-services
```

## Rollback Procedure

If a deployment introduces regressions:

```bash
# Immediate rollback to previous Helm release
helm rollback <service> 0 --namespace production --wait

# Or roll back to a specific revision
helm history <service> -n production
helm rollback <service> <revision> -n production --wait
```

For a critical rollback under 2 minutes, use the alias:
```bash
alias rollback='helm rollback $1 0 -n production --wait'
rollback payment-service
```

## Pod Disruption Budgets

All services must have a PDB that ensures at least 50% of pods are always available. This is enforced by the `platform-pdb-webhook` admission controller.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: <service>-pdb
spec:
  minAvailable: "50%"
  selector:
    matchLabels:
      app: <service>
```

## Karpenter Node Provisioning

New nodes are provisioned automatically by Karpenter when pending pods cannot be scheduled. Node types are governed by the NodePool manifests in `infra/karpenter/nodepools/`.

Key limits enforced:
- Max 100 nodes per node pool
- Spot instances preferred for `compute` pool; On-Demand required for `memory` pool
- Node TTL: 720 hours (30 days) to prevent configuration drift

## Resource Requests and Limits

All deployments must specify resource requests. The admission webhook rejects pods without them.

Recommended starting values:

| Service Type | CPU Request | Memory Request | CPU Limit | Memory Limit |
|-------------|-------------|----------------|-----------|--------------|
| API service | 100m | 256Mi | 500m | 512Mi |
| Worker | 200m | 512Mi | 1000m | 1Gi |
| Data processor | 500m | 1Gi | 2000m | 2Gi |

## Namespace Conventions

| Namespace | Usage |
|-----------|-------|
| `production` | Live customer traffic |
| `staging` | Pre-production validation |
| `tooling` | Internal tools, dashboards |
| `monitoring` | Prometheus, Grafana, alerting |

## Related Documents

- ADR-001: Migrate to EKS
- ADR-003: Adopt Karpenter
- Deployment Rollback Runbook (DevOps team)
- Platform SLO Policy
