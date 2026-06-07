# Fraud Detection Integration Guide

**Author:** Marcus Wong
**Team:** Payments
**Last Updated:** 2025-11-10
**Tags:** fraud, stripe-radar, payments, security, risk, machine-learning

## Overview

Fraud detection in the payment service is a layered approach: Stripe Radar handles card-level ML scoring, our internal rule engine applies business-specific rules, and the fraud team manually reviews flagged accounts.

## Layer 1: Stripe Radar

Stripe Radar ML assigns a risk score (0–100) to every charge based on:
- Card usage patterns across the Stripe network
- Device fingerprinting (via Stripe.js)
- Email/IP reputation
- Velocity checks

Our Radar rules (managed in the Stripe Dashboard):

| Rule | Action | Score Threshold |
|------|--------|----------------|
| High-risk score | Block | > 90 |
| Elevated-risk, first-time customer | 3DS challenge | > 70 |
| 3+ failed attempts in 10 minutes | Block IP | — |
| Order value > $500, new account | 3DS challenge | — |
| High-risk country list | Block | — |

### Radar Review Queue

Charges with score 60–90 land in the Radar review queue. The fraud team reviews these in the Stripe Dashboard daily. Average review-to-decision: 4 hours.

## Layer 2: Internal Rule Engine

Our rule engine runs synchronously in the charge API before calling Stripe. Written in Python with a Redis-backed counter store for velocity checks.

### Active Rules

```python
FRAUD_RULES = [
    # Velocity: max 5 charges per customer per hour
    VelocityRule(window="1h", max_attempts=5, scope="customer_id"),

    # Velocity: max 3 different cards per customer per 24h
    VelocityRule(window="24h", max_cards=3, scope="customer_id"),

    # Block known bad emails (updated weekly from fraud intelligence feed)
    EmailBlocklistRule(blocklist_source="s3://fraud-data/email-blocklist.txt"),

    # Block if order value > 10× customer's historical average
    AnomalousAmountRule(max_multiplier=10.0),

    # New account (< 7 days) + high value (> $200)
    NewAccountHighValueRule(account_age_days=7, threshold_cents=20000),
]
```

Rules return: `ALLOW`, `CHALLENGE` (force 3DS), or `BLOCK`.

### Adding New Rules

New rules must:
1. Be implemented as a class inheriting from `FraudRule`
2. Have unit tests with coverage > 95%
3. Be reviewed by the fraud team lead before production deployment
4. Be shadowed in production for 1 week before enforcement

## Layer 3: Manual Review

Accounts flagged by multiple rules, or with disputed charges, enter manual review:

```
Fraud Review Queue (internal admin):
  - https://admin.internal/fraud/review
  - Access: fraud team, payments team leads only
  - SLA: 24-hour review window
```

Actions available: `approve`, `block_account`, `require_reverification`, `add_to_watchlist`

## Metrics and Monitoring

Key fraud metrics (Datadog dashboard: "Payments / Fraud Detection"):

| Metric | Normal Range | Alert Threshold |
|--------|-------------|----------------|
| `fraud.radar.block_rate` | 0.1–0.5% | > 2% |
| `fraud.internal.challenge_rate` | 1–3% | > 8% |
| `fraud.dispute_rate` | < 0.2% | > 0.5% (chargeback risk) |
| `fraud.false_positive_rate` | < 1% | > 3% (customer impact) |

A spike in `block_rate` may indicate a legitimate payment method is being over-scored (false positive storm). Investigate promptly to avoid lost revenue.

## Incident Response: Fraud Spike

If `fraud.dispute_rate` exceeds 0.5%:

1. Pull disputed charge IDs from Stripe Dashboard → Disputes
2. Identify common attributes (BIN, email domain, IP range, amount)
3. Add targeted block rules to Radar or internal engine
4. Notify finance team (chargeback fees accrue immediately)
5. File fraud analysis report within 48 hours to `#fraud-ops`

## Related Documents

- Stripe Integration Guide
- Payment Retry Strategy
- PCI-DSS Compliance Checklist
- Chargeback Handling Runbook
