# Chargeback Handling Runbook

**Author:** Priya Patel
**Team:** Payments
**Last Updated:** 2025-11-05
**Tags:** chargeback, dispute, payments, stripe, fraud, runbook

## Overview

A chargeback (dispute) occurs when a cardholder contacts their bank to reverse a charge. Chargebacks are costly — we pay a $15 dispute fee regardless of outcome, plus potential revenue loss. This runbook covers our response procedures to maximize win rate on legitimate transactions.

## Dispute SLA

Stripe gives us 7–21 days to respond to a dispute (varies by card network). Our internal target is to respond within **3 business days**.

Failure to respond within the window results in automatic loss.

## Dispute Categories

| Dispute Reason | Strategy | Win Rate (2025 avg) |
|---------------|---------|-------------------|
| Fraud (unauthorized charge) | Submit compelling evidence | 35% |
| Not received (service not delivered) | Provide delivery/access proof | 70% |
| Unrecognized | Submit descriptor + receipt | 55% |
| Duplicate charge | Show distinct charge IDs | 90% |
| Credit not processed | Show refund record | 80% |
| Subscription cancelled | Show active session logs | 60% |

## Automated Alert

When Stripe sends a `charge.dispute.created` webhook:

1. Dispute is automatically created in our internal dispute tracker
2. Slack message posted to `#payments-disputes` with: customer ID, charge ID, amount, reason, response due date
3. Payments team lead assigned as owner

## Response Procedure

### Step 1: Pull Evidence (Day 1)

```bash
# Get dispute details
python scripts/disputes.py info --dispute-id dp_<id>

# Pull customer evidence package
python scripts/disputes.py package --dispute-id dp_<id> --output /tmp/evidence/
# Outputs: receipt, IP logs, login history, service access logs
```

### Step 2: Assess Win Likelihood

| Signal | Points |
|--------|--------|
| Customer logged in after charge | +30 |
| Customer contacted support without mentioning dispute | +20 |
| IP address matches customer's usual location | +15 |
| Feature usage after charge date | +25 |
| Matching billing descriptor | +10 |
| Prior disputes from same customer | -40 |

Total > 60 → submit response. Total ≤ 60 → consider accepting loss (saves time for low-value disputes).

### Step 3: Submit Evidence via Stripe

```python
stripe.Dispute.modify(
    dispute_id,
    evidence={
        "customer_email_address": customer.email,
        "billing_address": customer.billing_address,
        "customer_name": customer.name,
        "customer_ip_address": charge.ip_address,
        "customer_purchase_ip": charge.ip_address,
        "receipt": open("/tmp/evidence/receipt.pdf", "rb"),
        "service_date": charge.created_at.strftime("%Y-%m-%d"),
        "uncategorized_text": f"Customer logged in at {last_login}, accessed {features_used}.",
    },
    submit=True,
)
```

### Step 4: Track Outcome

Outcomes typically arrive 60–90 days after submission. Track in the dispute tracker:
- `won` → No action needed; revenue restored
- `lost` → Charge reversed; record in financial ledger
- `warning_closed` → Chargeback withdrawn by cardholder

## Chargeback Rate Monitoring

Visa and Mastercard put merchants on warning programs if dispute rate exceeds:
- **Visa:** 0.9% of transactions (Early Warning), 1.0% (Dispute Monitoring Program)
- **Mastercard:** 1.0% of transactions (Excessive Chargeback Program)

Our current rate: **0.18%** (January 2026). Alert fires at 0.5%.

If rate approaches the Visa threshold:
1. Notify VP Payments and Finance immediately
2. Engage Stripe's risk team for guidance
3. Tighten Radar rules to reduce fraud exposure

## Related Documents

- Fraud Detection Integration Guide
- Stripe Integration Guide
- Payment Reconciliation Process
- Refund Workflow Guide
