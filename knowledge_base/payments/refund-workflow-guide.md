# Refund Workflow Guide

**Author:** Alex Rivera
**Team:** Payments
**Last Updated:** 2026-01-08
**Tags:** refunds, payments, workflow, stripe, customer-support, payments

## Overview

This guide describes the end-to-end refund workflow, including system flows, business rules, exception handling, and SLAs. Refund processing is owned by the Payments team; customer support uses this guide to understand limitations and escalation paths.

## Refund Types

| Type | Description | Processing Time | Max Amount |
|------|-------------|----------------|------------|
| Full refund | Reverses entire charge | 5–10 business days | Original charge amount |
| Partial refund | Reverses a portion of charge | 5–10 business days | Up to original charge amount |
| Instant credit | Platform credit (not bank) | Immediate | $500 |
| Chargeback-initiated | Bank-initiated dispute resolution | 60–120 days | Original charge amount |

## Business Rules

1. **Refund window:** Full and partial refunds must be requested within 90 days of the original charge. Requests beyond 90 days require VP Operations approval.
2. **Minimum refund amount:** $0.50 (Stripe limitation).
3. **No refunds to expired cards:** If the original card has expired, a manual bank transfer must be issued.
4. **Subscription refunds:** Pro-rated refunds for mid-cycle cancellations are calculated by the billing service and injected into the refund request automatically.

## System Architecture

```
Customer Request
      │
      ▼
┌─────────────────────────────────────────────────┐
│  Refund API  (POST /api/v1/payment/refund)       │
│  - Validates business rules                      │
│  - Idempotency key enforcement                   │
└────────────────┬────────────────────────────────┘
                 │
      ┌──────────▼──────────┐
      │  Refund Queue       │  ← SQS FIFO queue
      │  (async processing) │    per-customer ordering
      └──────────┬──────────┘
                 │
      ┌──────────▼──────────┐
      │  Refund Worker      │
      │  - Calls Stripe API │
      │  - Updates DB state │
      │  - Emits event      │
      └──────────┬──────────┘
                 │
         ┌───────▼────────┐
         │  Stripe API    │
         └────────────────┘
```

## API Reference

### POST /api/v1/payment/refund

Request body:
```json
{
  "charge_id": "ch_3ABC123",
  "amount_cents": 5000,
  "reason": "customer_request",
  "idempotency_key": "refund-<uuid>",
  "metadata": {
    "support_ticket": "TICK-9821",
    "requested_by": "agent-id-42"
  }
}
```

Valid `reason` values: `customer_request`, `duplicate`, `fraudulent`, `service_not_provided`

Response (202 Accepted):
```json
{
  "refund_id": "ref_<uuid>",
  "status": "pending",
  "estimated_completion": "2026-01-13"
}
```

### GET /api/v1/payment/refund/{refund_id}

Returns current status: `pending` → `processing` → `succeeded` | `failed`

## Idempotency

Every refund request must include a unique `idempotency_key`. The system stores processed keys for 24 hours. Duplicate requests with the same key return the original response without creating a second refund.

## Failure and Retry Policy

Failed Stripe API calls are retried up to 5 times with exponential backoff (1s, 2s, 4s, 8s, 16s). After 5 failures the refund enters `manual_review` status and triggers a Slack alert to `#payments-ops`.

Common failure reasons:
- `charge_already_refunded` — full refund already exists
- `charge_expired_for_refund` — beyond 90-day window (Stripe-enforced)
- `insufficient_funds` — merchant balance insufficient (escalate to finance)

## Manual Refund Process

For cases outside automated processing (expired cards, API failures, >$500 instant credits):

1. Finance team issues manual bank transfer via ACH
2. Payments engineer marks the refund as `manual_completed` via admin API:
   ```bash
   curl -X PATCH https://api.internal/admin/refunds/<refund_id> \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"status": "manual_completed", "note": "ACH transfer issued, ref: ACH-293847"}'
   ```
3. Customer is notified by support

## SLAs

| Refund Type | Target Processing Time | P95 Actual (Jan 2026) |
|-------------|----------------------|----------------------|
| Standard refund | 7 business days | 4.2 business days |
| Instant credit | 5 seconds | 1.1 seconds |
| Manual transfer | 3 business days | 2.1 business days |

## Related Documents

- Payment Retry Strategy
- Stripe Integration Guide
- Chargeback Handling Runbook
- Payment Reconciliation Process
