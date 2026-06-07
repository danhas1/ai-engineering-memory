# Payment Reconciliation Process

**Author:** Marcus Wong
**Team:** Payments
**Last Updated:** 2025-12-05
**Tags:** reconciliation, payments, finance, stripe, settlement, accounting

## Overview

Daily reconciliation ensures that every charge processed through Stripe is correctly reflected in our database and financial ledger. Discrepancies are flagged within 24 hours of the settlement day. This document covers the automated reconciliation pipeline and the manual resolution process.

## Reconciliation Schedule

| Job | Schedule | Owner |
|-----|---------|-------|
| Daily charge reconciliation | 06:00 UTC (daily) | Automated |
| Refund reconciliation | 06:30 UTC (daily) | Automated |
| Weekly dispute reconciliation | 08:00 UTC (Monday) | Automated |
| Monthly settlement report | 07:00 UTC (1st of month) | Automated → Finance |

## How Reconciliation Works

```
Step 1: Fetch Stripe balance transactions
        (Stripe API: /balance_transactions?type=charge&created[gte]=yesterday)

Step 2: Fetch internal payment records
        (DB: SELECT * FROM payments WHERE settled_at::date = yesterday)

Step 3: Match by stripe_payment_intent_id

Step 4: Classify results:
        - MATCHED: both sides agree on amount + status
        - STRIPE_ONLY: charge in Stripe not in our DB → investigate
        - DB_ONLY: charge in our DB not in Stripe → investigate  
        - AMOUNT_MISMATCH: amount differs (possible fee calculation error)

Step 5: Publish reconciliation report to S3 + Slack notification
```

## Reconciliation Script

```bash
# Run manually for a specific date (YYYY-MM-DD)
python scripts/reconcile.py --date 2025-12-04 --report-to s3://reports/reconciliation/

# Dry run (no DB writes, just output the diff)
python scripts/reconcile.py --date 2025-12-04 --dry-run
```

## Discrepancy Types and Resolution

### STRIPE_ONLY Charges

A charge exists in Stripe but not in our database.

**Most common causes:**
1. Webhook processing failure (event in DLQ)
2. Race condition during high-volume periods
3. Charge created via Stripe Dashboard manually (should not happen)

**Resolution:**
```bash
# Check if webhook is in the DLQ
python scripts/find_webhook.py --payment-intent-id pi_<id>

# Manually sync a payment intent from Stripe to DB
python scripts/backfill_payment.py --payment-intent-id pi_<id>
```

### DB_ONLY Charges

A charge exists in our database with status `succeeded` but is not in Stripe's balance.

**Most common causes:**
1. Charge was created in test mode (should not reach production)
2. Charge was refunded immediately (check refunds table)
3. Data corruption (escalate to Payments team lead)

### AMOUNT_MISMATCH

The charged amount in Stripe differs from our record.

**Most common cause:** Currency conversion rounding. Acceptable tolerance: < $0.02 per transaction.

Mismatches > $0.02 are escalated to Finance for manual investigation.

## Reconciliation Metrics

Healthy day:
- 0 STRIPE_ONLY discrepancies
- 0 DB_ONLY discrepancies
- AMOUNT_MISMATCH rate < 0.01%

Alert thresholds:
- Any STRIPE_ONLY > 0 → Slack alert to `#payments-ops`
- Any DB_ONLY > 0 → PagerDuty to payments on-call
- AMOUNT_MISMATCH > 10 → Slack alert to `#payments-ops`

## Monthly Settlement Report

On the 1st of each month, the reconciliation job generates a PDF settlement report including:
- Total gross volume by currency
- Net volume (after refunds)
- Stripe fees breakdown
- Dispute loss
- Forex gain/loss

Delivered to Finance team by 08:00 UTC and stored in S3 (`s3://acme-reports/settlements/YYYY-MM/`).

## Related Documents

- Payment Service Architecture
- Stripe Integration Guide
- Currency Conversion Service Guide
- Refund Workflow Guide
