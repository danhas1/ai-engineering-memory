# Log Aggregation Architecture

**Author:** Ben Carter
**Team:** DevOps
**Last Updated:** 2025-12-05
**Tags:** logging, fluentbit, cloudwatch, datadog, observability, devops, architecture

## Overview

This document describes the log aggregation architecture, from application log emission to centralized storage and search in Datadog. All services write structured JSON logs to stdout; the platform handles shipping automatically.

## Architecture

```
Application Pods (stdout)
        │
        ▼
Fluent Bit (DaemonSet, 1 per node)
  - Reads from /var/log/containers/ (containerd log driver)
  - Enriches with Kubernetes metadata
  - Applies filters (drop health check noise)
  - Routes to multiple outputs
        │
        ├──► CloudWatch Logs (raw retention, 30 days)
        │
        └──► Datadog Logs (searchable, 15 days hot, 1 year archive)
```

## Fluent Bit Configuration

The Fluent Bit ConfigMap is in `infra/k8s/monitoring/fluent-bit-config.yaml`.

### Key Filters

```ini
[FILTER]
    Name         kubernetes
    Match        kube.*
    Kube_URL     https://kubernetes.default.svc:443
    Merge_Log    On          # merge JSON log body into record
    K8S-Logging.Exclude On  # respect annotation to exclude noisy pods

[FILTER]
    Name    grep
    Match   kube.*
    Exclude log /health  # Drop health check logs (high volume, low signal)

[FILTER]
    Name    record_modifier
    Match   kube.*
    Record  env production
    Record  region us-east-1
```

### Output Routing

```ini
[OUTPUT]
    Name              datadog
    Match             kube.*
    Host              http-intake.logs.datadoghq.com
    TLS               On
    apikey            ${DATADOG_API_KEY}
    dd_service        ${KUBE_APP_LABEL}
    dd_source         ${KUBE_APP_LABEL}
    dd_tags           env:production,team:${KUBE_TEAM_LABEL}

[OUTPUT]
    Name              cloudwatch_logs
    Match             kube.*
    region            us-east-1
    log_group_name    /eks/production
    log_stream_prefix pod-
    auto_create_group On
```

## Log Format Standard

All application logs must use structured JSON. Required fields:

```json
{
  "timestamp": "2025-12-05T14:22:33.123Z",
  "level": "info",
  "service": "payment-service",
  "message": "charge_processed",
  "charge_id": "ch_abc123",
  "duration_ms": 143,
  "trace_id": "abcdef1234567890"
}
```

**Required fields:** `timestamp`, `level`, `message`
**Recommended fields:** `trace_id` (for APM correlation), `correlation_id`, `customer_id`

Do NOT log raw credit card numbers, passwords, or full JWT tokens — the `detect-secrets` hook runs in CI, but defense in depth is everyone's responsibility.

## Log Retention Policy

| Storage | Duration | Access |
|---------|---------|--------|
| Datadog (hot) | 15 days | Full-text search, real-time |
| Datadog (archive → S3) | 1 year | Restore within 15 min (on-demand) |
| CloudWatch Logs | 30 days | Query via Insights |
| S3 Glacier (Datadog archive) | 7 years | Restore within 12 hours |

## Querying Logs

### Datadog Log Explorer

```
service:payment-service status:error @charge_id:ch_abc123
service:payment-service @duration_ms:>1000 env:production
```

### CloudWatch Insights

```sql
fields @timestamp, @message
| filter kubernetes.labels.app = "payment-service"
| filter level = "error"
| sort @timestamp desc
| limit 100
```

### Large-Scale Historical Analysis (Athena)

For log analysis beyond 30-day CloudWatch retention:

```sql
-- Find all errors for a specific customer across services
SELECT timestamp, service, message, correlation_id
FROM cloudwatch_logs_archive
WHERE customer_id = 'cust-uuid'
  AND level = 'error'
  AND year = '2025' AND month = '11'
ORDER BY timestamp DESC;
```

Athena table DDL: `infra/athena/log_archive.sql`

## Fluent Bit Performance

Fluent Bit is configured with resource limits:
```yaml
resources:
  limits:
    memory: 256Mi
    cpu: 200m
  requests:
    memory: 64Mi
    cpu: 50m
```

At peak, Fluent Bit processes ~500,000 log lines/minute across all nodes. Memory pressure alert fires at 80% of the limit.

## Related Documents

- Monitoring and Alerting Guide
- CI/CD Pipeline Guide
- Incident Response Process
