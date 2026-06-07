# API Gateway Architecture

**Author:** Tom Bradley
**Team:** Platform
**Last Updated:** 2025-12-10
**Tags:** api-gateway, architecture, nginx, rate-limiting, routing, platform

## Overview

The API Gateway is the single entry point for all external traffic. It handles TLS termination, authentication token validation, rate limiting, request routing, and observability instrumentation before forwarding requests to downstream microservices.

## Architecture Diagram

```
Internet
   │
   ▼
┌──────────────────────────────────────┐
│  AWS Application Load Balancer        │
│  TLS termination  │  WAF rules        │
└──────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────┐
│  API Gateway (NGINX + Lua)            │
│  Pods: 4 replicas (HPA: 4–16)        │
│                                       │
│  - JWT validation (shared secret)    │
│  - Rate limiting (Redis-backed)      │
│  - Request routing table             │
│  - Correlation ID injection          │
│  - Metrics export (StatsD→Datadog)   │
└──────────────────────────────────────┘
   │         │         │
   ▼         ▼         ▼
Payment   User Svc  Recommendation
Service            Svc
```

## Components

### NGINX + OpenResty

The gateway runs OpenResty (NGINX with Lua JIT) on the `platform/api-gateway` Docker image. Key modules:

- **lua-resty-jwt**: JWT signature verification
- **lua-resty-redis**: Rate limit counter storage
- **lua-resty-http**: Upstream health probes

### TLS Termination

TLS is terminated at the ALB level (ACM-managed certificates). The gateway receives HTTP/1.1 on port 8080 internally. HTTP/2 is negotiated at the ALB.

All internal service-to-service traffic uses mTLS managed by the service mesh (Linkerd).

## Routing Table

Routes are defined in `config/routes.yaml` and hot-reloaded via the `nginx -s reload` sidecar on ConfigMap changes.

| Path Prefix | Backend Service | Timeout |
|------------|----------------|---------|
| `/api/v1/payment` | `payment-service:8080` | 10s |
| `/api/v1/user` | `user-service:8080` | 5s |
| `/api/v1/recommendations` | `recommendation-service:8080` | 8s |
| `/api/internal/*` | Blocked (403) | — |
| `/health` | Gateway self-check | 1s |

## JWT Authentication

Every request to `/api/v1/*` must carry a valid JWT in the `Authorization: Bearer <token>` header.

Validation steps:
1. Decode header without signature verification — check `alg` is `RS256`
2. Verify signature against public key fetched from `https://auth.internal/.well-known/jwks.json`
3. Check `exp` claim is in the future
4. Check `iss` claim matches `https://auth.acmecorp.internal`
5. Inject `X-User-ID` and `X-User-Role` headers before forwarding

JWKS keys are cached for 5 minutes with background refresh to avoid auth outages on key rotation.

## Rate Limiting

Rate limits are enforced per API key (extracted from JWT `sub` claim) using a sliding window counter stored in Redis:

| Tier | Requests/minute | Burst |
|------|----------------|-------|
| Free | 60 | 10 |
| Pro | 600 | 50 |
| Enterprise | 6,000 | 200 |
| Internal | Unlimited | — |

When a client exceeds the limit, the gateway returns:
```
HTTP 429 Too Many Requests
Retry-After: <seconds-until-window-resets>
X-RateLimit-Limit: <limit>
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <epoch>
```

## Correlation IDs

Every request is assigned a UUID4 `X-Request-ID` header on ingress (or the client-supplied value is propagated if already present). This ID is logged at every service hop, enabling full distributed trace reconstruction without a dedicated trace agent.

## HPA Configuration

The gateway scales based on CPU utilization and request queue depth:

```yaml
metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        averageUtilization: 60
  - type: External
    external:
      metric:
        name: nginx_request_queue_depth
      target:
        value: "500"
```

Min replicas: 4 (ensures HA across 4 AZs)
Max replicas: 16

## Observability

All request logs are emitted to stdout in JSON format and ingested by Fluent Bit into CloudWatch Logs → Datadog.

Key metrics exported per route:
- `gateway.requests_total` (tagged by route, status_code, method)
- `gateway.request_duration_ms` (p50, p95, p99)
- `gateway.rate_limit_hits_total`
- `gateway.auth_failures_total`

## Deployment

```bash
# Update routing config (hot-reload, no pod restart)
kubectl create configmap api-gateway-routes \
  --from-file=config/routes.yaml -n production --dry-run=client -o yaml \
  | kubectl apply -f -

# Full gateway rollout
helm upgrade api-gateway charts/api-gateway \
  --namespace production \
  --set image.tag=<sha> \
  --atomic --timeout 8m
```

## Related Documents

- Service Mesh Configuration Guide
- Platform SLO Policy
- Load Balancer Configuration Runbook
- Kubernetes Deployment Guide
