# Monitoring and Alerting Guide

**Author:** Chris Walsh
**Team:** DevOps
**Last Updated:** 2026-02-01
**Tags:** monitoring, alerting, datadog, prometheus, grafana, observability, devops

## Overview

This guide describes the observability stack, how to instrument new services, how alerts are configured, and how to work with the dashboards during incidents.

## Observability Stack

| Component | Tool | Purpose |
|-----------|------|---------|
| Metrics | Datadog (primary), Prometheus | Service-level metrics, business KPIs |
| Logs | CloudWatch Logs → Datadog Logs | Structured log aggregation |
| Traces | Datadog APM | Distributed request tracing |
| Synthetics | Checkly | External uptime and flow monitoring |
| Dashboards | Datadog + Grafana | Operations and business visibility |
| Alerting | PagerDuty (routing), Datadog (detection) | On-call notifications |

## Instrumentation Standards

### Application Metrics (StatsD)

All services emit metrics via the DogStatsD client:

```python
from datadog import statsd

# Request counter
statsd.increment("service.requests_total", tags=["route:/charge", "method:POST", "status:200"])

# Latency histogram
statsd.histogram("service.request_duration_ms", duration_ms, tags=["route:/charge"])

# Business metric
statsd.gauge("payments.queue_depth", queue_depth)
```

Required metrics for every service:
- `<service>.requests_total` (counter, tags: route, method, status_code)
- `<service>.request_duration_ms` (histogram)
- `<service>.errors_total` (counter, tags: route, error_type)
- `<service>.ready` (gauge: 1=healthy, 0=unhealthy)

### Structured Logging

All logs must be emitted as JSON to stdout:

```python
import structlog

logger = structlog.get_logger()

logger.info("charge_processed",
    charge_id="ch_abc123",
    amount_cents=4999,
    duration_ms=143,
    customer_id="cust-uuid",
)
```

Logs are ingested by Fluent Bit (DaemonSet on every node) and forwarded to Datadog with Kubernetes metadata enrichment (pod name, namespace, deployment, node).

### Distributed Tracing

Trace context is injected automatically by the Datadog APM agent (via dd-trace library). Manual instrumentation for critical paths:

```python
from ddtrace import tracer

@tracer.wrap("payment.process_charge")
def process_charge(charge_data):
    with tracer.trace("stripe.api.call") as span:
        span.set_tag("stripe.charge_id", charge_id)
        response = stripe.PaymentIntent.create(...)
```

## Alert Configuration

All alerts are defined as Terraform in `infra/terraform/datadog_monitors.tf`.

### Standard Alert Template

```hcl
resource "datadog_monitor" "service_error_rate" {
  name    = "Payment Service — Error Rate > 1%"
  type    = "metric alert"
  message = <<-EOT
    Payment service error rate has exceeded 1% for 5 minutes.
    
    Current value: {{value}}
    Threshold: {{threshold}}
    
    @pagerduty-payments-oncall
    Runbook: https://wiki.internal/runbooks/payment-service
  EOT

  query = "sum(last_5m):sum:payment_service.errors_total{env:production}.as_count() / sum:payment_service.requests_total{env:production}.as_count() * 100 > 1"

  monitor_thresholds {
    warning  = 0.5
    critical = 1.0
  }
  
  notify_audit        = false
  require_full_window = false
  renotify_interval   = 20   # re-page if unresolved after 20 min
}
```

## Alert Routing

PagerDuty routes alerts by service and severity:

| Alert Tag | PagerDuty Service | On-Call |
|-----------|------------------|---------|
| `service:payment-service` | Payments | Payments on-call |
| `service:api-gateway` | Platform | Platform on-call |
| `service:data-pipeline` | Data | Data on-call |
| `severity:sev1` | All | Primary + Secondary + VP |

## SLO Monitors

Each team's SLO is tracked in Datadog SLO objects:

```hcl
resource "datadog_service_level_objective" "payment_availability" {
  name    = "Payment Service Availability"
  type    = "monitor"
  target_threshold = 99.9
  timeframe        = "30d"
  
  monitor_ids = [datadog_monitor.service_error_rate.id]
}
```

SLO burn rate alerts fire when the error budget is consumed too fast (5× burn over 1 hour = SEV2 alert).

## Key Dashboards

| Dashboard | URL | Audience |
|-----------|-----|---------|
| Service Health | `https://app.datadoghq.com/dashboard/production-services` | On-call engineers |
| Payment Metrics | `https://app.datadoghq.com/dashboard/payments` | Payments team |
| Infrastructure | `https://app.datadoghq.com/infrastructure` | Platform team |
| SLO Overview | `https://app.datadoghq.com/slo` | Engineering leads |

## Related Documents

- Incident Response Process
- Log Aggregation Architecture
- CI/CD Pipeline Guide
- Platform SLO Policy (Platform team)
