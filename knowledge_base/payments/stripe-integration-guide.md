# Stripe Integration Guide

**Author:** Marcus Wong
**Team:** Payments
**Last Updated:** 2025-11-25
**Tags:** stripe, payments, api, integration, webhooks, pci-dss

## Overview

This guide covers the Stripe integration architecture used by the payment service, including API usage patterns, webhook processing, testing procedures, and operational considerations.

## Stripe Products Used

| Product | Purpose | Environment |
|---------|---------|-------------|
| Payment Intents | Charging customers | Production + Staging |
| Stripe Radar | Fraud detection | Production only |
| Billing (Subscriptions) | Recurring payments | Production + Staging |
| Connect (Marketplace) | Third-party payouts | Production only |
| Stripe CLI | Local webhook testing | Development only |

## API Keys and Environments

| Environment | Key Type | Storage Location |
|-------------|----------|-----------------|
| Production | `sk_live_*` | AWS Secrets Manager: `production/payment-service/stripe-live-key` |
| Staging | `sk_test_*` | AWS Secrets Manager: `staging/payment-service/stripe-test-key` |
| Development | `sk_test_*` | `.env.local` (never committed) |

API keys are rotated every 90 days via the Secrets Management process. The publishable key (`pk_*`) is safe to expose to frontends.

## Payment Flow: Charge a Customer

We use the Payment Intents API with server-side confirmation to avoid storing card data in our systems (PCI scope reduction):

### Step 1: Create Payment Intent (Server)

```python
import stripe

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

intent = stripe.PaymentIntent.create(
    amount=amount_cents,              # e.g., 4999 for $49.99
    currency="usd",
    customer=stripe_customer_id,
    payment_method=payment_method_id,
    confirm=True,
    off_session=False,               # set True for subscriptions
    return_url="https://acmecorp.com/payment/complete",
    metadata={
        "order_id": order_id,
        "user_id": user_id,
    },
    idempotency_key=f"intent-{order_id}",
)
```

### Step 2: Handle 3DS Authentication (if required)

If `intent.status == "requires_action"`, the frontend must complete SCA (3D Secure):

```javascript
const { paymentIntent, error } = await stripe.confirmCardPayment(
  intent.client_secret
);
```

### Step 3: Confirm Final State

```python
if intent.status == "succeeded":
    fulfill_order(order_id)
elif intent.status == "requires_payment_method":
    handle_payment_failure(intent.last_payment_error)
```

## Webhook Processing

Stripe sends event notifications to `https://api.acmecorp.com/api/v1/payment/stripe-webhook`.

### Verified Events We Handle

| Event | Handler Action |
|-------|---------------|
| `payment_intent.succeeded` | Fulfill order, send receipt |
| `payment_intent.payment_failed` | Trigger retry logic, notify customer |
| `charge.refunded` | Update refund status to `succeeded` |
| `customer.subscription.deleted` | Downgrade user account |
| `invoice.payment_failed` | Initiate subscription retry schedule |

### Webhook Signature Verification

Every webhook request must be verified before processing:

```python
def verify_stripe_webhook(payload: bytes, signature: str) -> stripe.Event:
    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=signature,
            secret=os.getenv("STRIPE_WEBHOOK_SECRET"),
        )
        return event
    except stripe.error.SignatureVerificationError:
        raise ValueError("Invalid webhook signature")
```

The webhook secret is stored in `production/payment-service/stripe-webhook-secret`.

### Idempotent Webhook Handling

Stripe may deliver the same event multiple times. All handlers must be idempotent:

```python
def handle_payment_succeeded(event_id: str, payment_intent_id: str):
    if db.processed_events.exists(event_id):
        return   # already handled
    with db.transaction():
        db.orders.update(payment_intent_id=payment_intent_id, status="paid")
        db.processed_events.insert(event_id, processed_at=now())
```

## Testing

### Stripe Test Cards

| Number | Scenario |
|--------|---------|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 0002` | Card declined |
| `4000 0025 0000 3155` | 3DS authentication required |
| `4000 0000 0000 9995` | Insufficient funds |

### Local Webhook Testing

```bash
# Install Stripe CLI, then:
stripe listen --forward-to localhost:8080/api/v1/payment/stripe-webhook

# In another terminal, trigger a test event:
stripe trigger payment_intent.succeeded
```

## Stripe Radar (Fraud)

Radar rules are managed in the Stripe Dashboard by the fraud team. Key rules active in production:

- Block payments with Radar ML score > 90
- Block cards from high-risk countries (configurable list)
- 3DS required for orders > $500

Radar allow/block lists are maintained by the fraud team.

## Error Handling Reference

```python
try:
    intent = stripe.PaymentIntent.create(...)
except stripe.error.CardError as e:
    handle_card_error(e.code, e.param)
except stripe.error.RateLimitError:
    queue_for_retry()
except stripe.error.InvalidRequestError as e:
    log.error("Invalid Stripe request: %s", e)
    raise
except stripe.error.AuthenticationError:
    alert_oncall("Stripe API key issue")
    raise
except stripe.error.APIConnectionError:
    queue_for_retry(delay=30)
except stripe.error.StripeError:
    queue_for_retry()
```

## Related Documents

- PCI-DSS Compliance Checklist
- Payment Retry Strategy
- Refund Workflow Guide
- Payment Webhook Processing
