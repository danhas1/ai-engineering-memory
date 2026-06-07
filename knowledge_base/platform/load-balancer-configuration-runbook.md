# Load Balancer Configuration Runbook

**Author:** Tom Bradley
**Team:** Platform
**Last Updated:** 2025-12-20
**Tags:** load-balancer, alb, nlb, aws, routing, platform, runbook

## Overview

This runbook covers the configuration, maintenance, and troubleshooting of AWS Application Load Balancers (ALBs) and Network Load Balancers (NLBs) used in production. All load balancers are provisioned via the AWS Load Balancer Controller running in the EKS cluster.

## Load Balancer Inventory

| Name | Type | Purpose | ARN Suffix |
|------|------|---------|-----------|
| `alb-prod-external` | ALB | Customer-facing traffic | k8s-prod-external |
| `alb-prod-internal` | ALB | Service-to-service (non-mesh) | k8s-prod-internal |
| `nlb-payments` | NLB | Payment service (low-latency) | k8s-pay-nlb |
| `alb-staging` | ALB | Staging environment | k8s-stg |

## ALB Configuration via Ingress Annotations

All ALB settings are controlled by Kubernetes Ingress annotations. The AWS Load Balancer Controller translates these into ALB configuration automatically.

### Standard External Ingress Template

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: <service>-ingress
  namespace: production
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-east-1:<acct>:certificate/<id>
    alb.ingress.kubernetes.io/ssl-policy: ELBSecurityPolicy-TLS13-1-2-2021-06
    alb.ingress.kubernetes.io/wafv2-acl-arn: arn:aws:wafv2:...
    alb.ingress.kubernetes.io/healthcheck-path: /health
    alb.ingress.kubernetes.io/healthcheck-interval-seconds: "15"
    alb.ingress.kubernetes.io/healthy-threshold-count: "2"
    alb.ingress.kubernetes.io/unhealthy-threshold-count: "3"
    alb.ingress.kubernetes.io/load-balancer-attributes: >-
      idle_timeout.timeout_seconds=60,
      routing.http.drop_invalid_header_fields.enabled=true,
      access_logs.s3.enabled=true,
      access_logs.s3.bucket=alb-access-logs-prod,
      access_logs.s3.prefix=<service>
spec:
  rules:
    - host: api.acmecorp.com
      http:
        paths:
          - path: /api/v1/<service>
            pathType: Prefix
            backend:
              service:
                name: <service>
                port:
                  number: 8080
```

## Health Check Configuration

Every service must pass the ALB health check to receive traffic. Default settings:

- **Path:** `/health` (must return HTTP 200)
- **Interval:** 15 seconds
- **Healthy threshold:** 2 consecutive successes
- **Unhealthy threshold:** 3 consecutive failures
- **Timeout:** 5 seconds

When a pod fails 3 consecutive health checks, the ALB stops routing traffic to it and Kubernetes is notified via the Endpoint readiness gate.

## Troubleshooting Unhealthy Targets

```bash
# Check target group health via AWS CLI
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:...

# Get target group ARN from Ingress
kubectl describe ingress <service>-ingress -n production \
  | grep "aws-load-balancer-controller/target-group-arn"

# Check pod health endpoint directly
kubectl exec -it <pod> -n production -- curl -v http://localhost:8080/health
```

## SSL/TLS Policy Updates

When updating the TLS policy (e.g., to deprecate TLS 1.2):

1. Update the annotation `alb.ingress.kubernetes.io/ssl-policy` in the Ingress manifest
2. Apply with `kubectl apply -f`
3. The controller will update the ALB listener — no downtime
4. Verify in the AWS console: EC2 → Load Balancers → Listeners → Security policy

## Access Log Analysis

ALB access logs are written to S3 (`alb-access-logs-prod/<service>/`) and queried via Athena:

```sql
-- Top 10 slowest paths in the last hour
SELECT request_url, 
       COUNT(*) AS requests,
       AVG(target_processing_time) AS avg_processing_ms
FROM alb_logs
WHERE timestamp >= now() - interval '1' hour
GROUP BY request_url
ORDER BY avg_processing_ms DESC
LIMIT 10;
```

Athena table DDL is maintained in `infra/athena/alb-logs.sql`.

## Planned Maintenance Procedure

For ALB configuration changes that may cause brief connection resets:

1. Post notice in `#platform-oncall` Slack channel with ETA
2. Schedule change for off-peak hours (02:00–05:00 UTC)
3. Apply change and monitor ALB CloudWatch metrics for 5 minutes
4. Confirm healthy target count returns to baseline

## Related Documents

- API Gateway Architecture
- Kubernetes Deployment Guide
- Platform SLO Policy
- Service Mesh Configuration Guide
