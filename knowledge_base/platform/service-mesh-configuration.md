# Service Mesh Configuration Guide

**Author:** Jake Morrison
**Team:** Platform
**Last Updated:** 2025-11-20
**Tags:** service-mesh, linkerd, mtls, observability, traffic-management, platform

## Overview

The platform team operates Linkerd 2.14 as the service mesh across all production and staging EKS clusters. Linkerd provides automatic mTLS, traffic metrics, retries, and circuit breaking for all meshed services without code changes.

## Mesh Scope

All pods in the `production` and `staging` namespaces are automatically injected with the Linkerd proxy sidecar via the `linkerd.io/inject: enabled` namespace annotation.

Namespaces **excluded** from mesh injection:
- `kube-system`
- `monitoring` (Prometheus scrapes bypass the proxy)
- `cert-manager`

## mTLS Configuration

Linkerd issues short-lived workload certificates automatically (default TTL: 24 hours) from the Linkerd trust anchor (a self-signed CA stored in AWS Secrets Manager and rotated quarterly).

To verify mTLS is active between two services:

```bash
linkerd viz edges deployment -n production
# Shows: SRC → DST  SECURED(mTLS)
```

To check the certificate for a specific pod:
```bash
linkerd diagnostics proxy-metrics -n production <pod-name> | grep tls
```

## Traffic Management

### Retries

HTTP GET requests are automatically retried once on 5xx responses. For idempotent POST endpoints, annotate the Service:

```yaml
metadata:
  annotations:
    retry.linkerd.io/http: "5xx"
    retry.linkerd.io/limit: "3"
```

### Circuit Breaking (via ServiceProfile)

Define error budgets per route with `ServiceProfile`:

```yaml
apiVersion: linkerd.io/v1alpha2
kind: ServiceProfile
metadata:
  name: payment-service.production.svc.cluster.local
  namespace: production
spec:
  routes:
    - name: POST /charge
      condition:
        method: POST
        pathRegex: /charge
      responseClasses:
        - condition:
            status:
              min: 500
              max: 599
          isFailure: true
      retryBudget:
        retryRatio: 0.2       # allow 20% of requests to be retries
        minRetriesPerSecond: 5
        ttl: 10s
```

### Timeouts

Per-route timeouts are configured in the ServiceProfile `timeout` field. Default is 10s. All services must explicitly set timeouts matching their SLA.

## Observability

The Linkerd Viz extension provides the built-in dashboard at `https://linkerd-viz.internal`:

```bash
# Live traffic stats for a deployment
linkerd viz stat deployment -n production

# Live request-level telemetry (golden signals)
linkerd viz top deployment/payment-service -n production

# HTTP error rate for a specific route
linkerd viz routes deployment/payment-service -n production
```

Key metrics available in Grafana (Linkerd dashboard set):
- `request_total` by direction, source, destination
- `response_total` by classification (success/failure)
- `response_latency_ms_bucket` (latency histogram)

## Ingress Integration

The Linkerd proxy is inserted between the API Gateway and downstream services. The gateway forwards `l5d-dst-override` headers for canary routing when needed.

## Upgrading Linkerd

Linkerd upgrades require a rolling restart of all meshed pods to pick up the new proxy binary. The platform team follows a quarterly upgrade cadence.

```bash
# Step 1: Upgrade control plane
linkerd upgrade | kubectl apply -f -

# Step 2: Verify control plane health
linkerd check

# Step 3: Rolling restart all meshed namespaces
for ns in production staging; do
  kubectl rollout restart deployment -n $ns
done
```

**Important:** Always upgrade staging first and validate mesh health with `linkerd check` before upgrading production.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Pod stuck in `Pending` after injection | Sidecar image pull failure | Check ECR pull secret on namespace |
| mTLS not shown for a service | Injection annotation missing | Add `linkerd.io/inject: enabled` to namespace or pod spec |
| High proxy CPU | Large request volume | Increase proxy resource limits in annotation |
| Route not in ServiceProfile | Missing ServiceProfile resource | Apply missing ServiceProfile manifest |

## Related Documents

- Kubernetes Deployment Guide
- API Gateway Architecture
- Platform SLO Policy
