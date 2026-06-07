# Payment Service Architecture

**Author:** Alex Rivera
**Team:** Payments
**Last Updated:** 2025-12-01
**Tags:** architecture, payments, microservices, stripe, redis, postgresql

## Overview

The Payment Service is the core financial transaction processor. It handles charge initiation, refund processing, subscription billing, and reconciliation. It exposes REST APIs consumed by the API Gateway and communicates asynchronously via SQS for retries and webhook processing.

## Service Boundaries

The payment service owns:
- Customer payment method management (Stripe customer objects)
- Charge and refund lifecycle
- Subscription billing state
- Financial event stream (published to SNS)

The payment service does NOT own:
- Fraud scoring (delegated to Stripe Radar)
- User identity (user service)
- Order management (order service)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Payment Service                                                 │
│                                                                  │
│  ┌──────────────────┐   ┌──────────────────┐                   │
│  │ Charge API       │   │ Refund API        │                   │
│  │ POST /charge     │   │ POST /refund      │                   │
│  │ GET /status      │   │ GET /refund/{id}  │                   │
│  └────────┬─────────┘   └────────┬──────────┘                  │
│           │                      │                               │
│  ┌────────▼──────────────────────▼──────────┐                  │
│  │         Payment Processor Core            │                  │
│  │  - Idempotency enforcement               │                  │
│  │  - Retry queue management                │                  │
│  │  - State machine (pending→settled)       │                  │
│  └────────┬──────────────────────┬──────────┘                  │
│           │                      │                               │
│    ┌──────▼──────┐       ┌───────▼───────┐                     │
│    │ PostgreSQL   │       │ SQS FIFO      │                     │
│    │ (state)      │       │ (retry queue) │                     │
│    └─────────────┘       └───────────────┘                     │
│           │                                                       │
│    ┌──────▼──────┐                                              │
│    │ Redis        │  ← idempotency keys, rate limit counters    │
│    └─────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
                │
                ▼ Stripe API (external)
```

## Database Schema (Key Tables)

### `payments`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `stripe_payment_intent_id` | VARCHAR | Stripe's ID |
| `customer_id` | UUID | FK to users |
| `amount_cents` | INTEGER | In USD cents |
| `currency` | VARCHAR(3) | e.g., "usd" |
| `status` | ENUM | pending, succeeded, failed, refunded |
| `idempotency_key` | VARCHAR | Unique per charge attempt |
| `created_at` | TIMESTAMPTZ | |
| `settled_at` | TIMESTAMPTZ | Nullable |

### `refunds`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `payment_id` | UUID | FK to payments |
| `stripe_refund_id` | VARCHAR | Stripe's refund ID |
| `amount_cents` | INTEGER | Amount refunded |
| `status` | ENUM | pending, processing, succeeded, failed |
| `reason` | VARCHAR | e.g., "customer_request" |

## State Machine

```
Payment States:
  created → pending → processing → succeeded
                    ↘            ↘ failed → retrying → succeeded
                                           ↘ permanently_failed
```

State transitions are atomic with database row locking to prevent race conditions in the retry worker.

## Performance Characteristics

- **Throughput:** 350 RPS peak (Black Friday 2025 observed), target 1,000 RPS with current infra
- **p99 latency:** 420ms (Stripe API dominates; our service adds ~15ms overhead)
- **DB connection pool:** 20 connections via PgBouncer (transaction mode)
- **Redis cache TTL for idempotency keys:** 24 hours

## Deployment

- **Language:** Python 3.12 (FastAPI)
- **Replicas:** 6 (production), 2 (staging), HPA max 20
- **Resources:** 200m CPU request / 1000m limit, 512Mi memory / 1Gi limit
- **Readiness probe:** `GET /health/ready` (checks DB + Stripe reachability)
- **Liveness probe:** `GET /health/live` (basic process health)

## Financial Event Stream

Every payment state change publishes an event to `arn:aws:sns:...:payments-events`. Consumers:
- Analytics pipeline (Data team) — near-real-time revenue reporting
- Reconciliation service — daily settlement verification
- Notification service — customer email/SMS receipts

## Runbook Links

- Payment Service Runbook (existing)
- Chargeback Handling Runbook
- Refund Workflow Guide

## Related Documents

- Stripe Integration Guide
- Payment Retry Strategy
- PCI-DSS Compliance Checklist
