# Payment Retry Strategy

**Author:** Priya Patel
**Team:** Payments
**Last Updated:** 2025-12-15
**Tags:** retry, payments, resilience, stripe, idempotency, fault-tolerance

## Overview

This document defines the retry strategy for failed payment attempts, covering both customer-initiated retries (soft declines) and system-level retries for transient infrastructure failures. A well-implemented retry strategy is critical for maximizing revenue recovery while avoiding duplicate charges and card abuse.

## Failure Classification

### Hard Declines (Do Not Retry)

These failure codes indicate permanent rejection. Retrying will not succeed and may trigger fraud flags:

| Stripe Code | Reason | Action |
|-------------|--------|--------|
| `card_declined` with `do_not_honor` | Bank permanent block | Show error, ask customer to use different card |
| `card_not_supported` | Card type not supported | Suggest alternative payment method |
| `expired_card` | Card expired | Prompt card update |
| `incorrect_cvc` | Wrong CVC entered | Allow 3 retry attempts, then lock |
| `fraudulent` | Fraud detected by Stripe Radar | Block customer, alert fraud team |

### Soft Declines (May Retry)

These indicate a temporary issue that may resolve:

| Stripe Code | Reason | Retry Strategy |
|-------------|--------|---------------|
| `insufficient_funds` | Momentarily low balance | Retry after 24h, 72h, 7d |
| `processing_error` | Bank processing glitch | Retry after 5s, 30s, 5m |
| `rate_limit` | Our Stripe rate limit hit | Retry after 1s with jitter |
| `service_unavailable` | Bank temporarily unavailable | Retry after 2m, 10m, 30m |

## Customer-Facing Retry Policy (Subscriptions)

For recurring subscription payments, the retry schedule is:

```
Day 0:   Initial charge attempt
Day 1:   First retry (if Day 0 failed with soft decline)
Day 3:   Second retry
Day 7:   Third retry
Day 14:  Final retry + subscription suspension warning email
Day 21:  Subscription suspended, downgrade to free tier
Day 30:  Account flagged for potential cancellation
```

The customer receives an email notification at each failed attempt with a direct link to update their payment method.

## System-Level Retry (Infrastructure Failures)

Network errors, timeouts, and 5xx responses from Stripe are handled at the service level:

```python
RETRY_CONFIG = {
    "max_attempts": 5,
    "initial_backoff_seconds": 1,
    "backoff_multiplier": 2,
    "max_backoff_seconds": 30,
    "jitter": True,      # ±20% randomization to avoid thundering herd
    "retryable_statuses": [408, 429, 500, 502, 503, 504],
}
```

Every retry uses the same `idempotency_key` as the original request, so Stripe guarantees exactly-once processing even if the same request is received multiple times.

## Idempotency Key Generation

```python
def generate_idempotency_key(customer_id: str, order_id: str, attempt: int) -> str:
    # Stable across retries for the same charge event
    return f"charge-{customer_id}-{order_id}-{attempt}"
```

`attempt` increments only for customer-facing subscription retries (Day 1, Day 3, etc.), not for system retries. System retries reuse `attempt=0`'s key.

## Rate Limiting and Throttling

We send a maximum of 100 charge requests/second to Stripe (our rate limit is 1000 RPS, but we throttle at 10% to provide headroom). During Black Friday:

1. Payment requests enter an SQS FIFO queue
2. A worker pool consumes at the rate-limited pace
3. Queue depth alert fires at 10,000 items (estimated 100-second drain time)

## Retry Metrics

Monitored in Datadog (dashboard: "Payments / Retry Analytics"):

- `payments.retry.count` by `reason_code`
- `payments.retry.success_rate` (how many eventually succeed after retry)
- `payments.soft_decline.rate` (early warning for card BIN issues)
- `payments.idempotency.conflicts` (should be near zero)

## Revenue Recovery Tracking

Finance receives a weekly recovery report showing:
- Total failed payments
- Amount recovered via retry
- Lost revenue (hard declines + expired retry windows)
- Recovery rate by customer segment

## Related Documents

- Refund Workflow Guide
- Stripe Integration Guide
- Payment Service Architecture
- Chargeback Handling Runbook
