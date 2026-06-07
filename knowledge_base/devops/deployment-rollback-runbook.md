# Deployment Rollback Runbook

**Author:** Chris Walsh
**Team:** DevOps
**Last Updated:** 2025-11-28
**Tags:** rollback, deployment, helm, argocd, runbook, devops, kubernetes

## Overview

This runbook covers the procedure for rolling back a deployment when a release introduces regressions. Speed is critical — a faulty deploy can cause an outage within seconds of traffic shifting to the new pods.

## Decision: Rollback vs. Hot Fix

Roll back immediately if:
- Error rate > 5% within 5 minutes of deployment
- p99 latency increased > 3× vs. pre-deploy baseline
- Any CrashLoopBackOff pods post-deploy
- Critical functionality broken

Apply a hot fix instead if:
- Rollback would lose important data migrations already applied
- The issue affects < 1% of users
- A single-line fix is faster to deploy than rolling back

When in doubt: **roll back first, fix forward later.**

## Rollback Methods

### Method 1: Helm Rollback (Recommended, < 2 minutes)

```bash
# List recent Helm revisions
helm history <service> -n production

# Roll back to immediately previous release
helm rollback <service> 0 -n production --wait --timeout 5m

# Roll back to a specific revision (e.g., revision 14)
helm rollback <service> 14 -n production --wait --timeout 5m
```

The `--wait` flag blocks until all pods are healthy in the target revision.

### Method 2: ArgoCD Rollback (via UI)

1. Open ArgoCD at `https://argocd.internal`
2. Find the application
3. Click "History" (clock icon)
4. Select the previous sync and click "Rollback"
5. Monitor the sync status until all pods are green

### Method 3: kubectl (Emergency Only)

If Helm and ArgoCD are both unavailable:

```bash
# Roll back the Kubernetes Deployment directly
kubectl rollout undo deployment/<service> -n production

# Roll back to a specific revision
kubectl rollout history deployment/<service> -n production
kubectl rollout undo deployment/<service> -n production --to-revision=<N>

# Monitor rollback progress
kubectl rollout status deployment/<service> -n production
```

**Note:** kubectl rollbacks bypass ArgoCD and will cause drift. After the emergency, re-sync ArgoCD to reconcile.

## Post-Rollback Checklist

```
[ ] Error rate returned to pre-deploy baseline (check Datadog)
[ ] p99 latency returned to pre-deploy baseline
[ ] No CrashLoopBackOff pods
[ ] Health endpoint returning 200
[ ] Smoke test passing (run manually if CI is slow):
      kubectl exec -it deploy/<any-other-svc> -n production -- \
        curl -sf http://<service>.production.svc.cluster.local/health
[ ] Notify #deployments Slack: "Rollback to <rev> complete for <service>"
[ ] Update incident channel if open
[ ] Revert the PR that caused the regression (open revert PR)
```

## Rollback of Database Migrations

A deployment that includes a DB migration is more complex to roll back:

1. First, roll back the application code (Helm/ArgoCD)
2. Assess whether the migration is backward-compatible:
   - **Additive only** (new nullable columns, new indexes): app can run on old schema — no migration rollback needed
   - **Destructive** (dropped columns, type changes): must run down migration before reverting app

```bash
# Run down migration (if available)
kubectl exec -it deploy/<service> -n production -- \
  alembic downgrade -1

# Or for Flyway
kubectl exec -it deploy/<service> -n production -- \
  flyway -url=jdbc:postgresql://... undo
```

**If no down migration exists:** escalate to the owning service team immediately. Data loss may occur.

## Rollback of Dependent Services

If the regression cascades to downstream services:
1. Identify all services with elevated errors (Datadog service map)
2. Assess if their errors are caused by the reverted service
3. Rolling back the root cause typically resolves cascades within 60 seconds

## RCA After Rollback

All rollbacks require a root cause analysis entry in the post-deploy retrospective within 2 business days. Add to `docs/deploy-retrospectives/YYYY-MM-DD-<service>.md`.

## Related Documents

- CI/CD Pipeline Guide
- Incident Response Process
- Kubernetes Deployment Guide (Platform team)
