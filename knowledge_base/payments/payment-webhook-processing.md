# Payment Webhook Processing

**Author:** Priya Patel
**Team:** Payments
**Last Updated:** 2025-11-30
**Tags:** webhooks, stripe, async, payments, reliability, idempotency

## Overview

Stripe delivers webhook events to our payment service to notify us of asynchronous state changes (charge success/failure, subscription changes, refund completion). This document covers the processing architecture, reliability guarantees, and operational runbook.

## Webhook Endpoint

**URL:** `POST https://api.acmecorp.com/api/v1/payment/stripe-webhook`

The endpoint is exposed through the API gateway with a dedicated rate limit bucket (10,000 events/minute) separate from customer-facing traffic.

## Processing Architecture

```
Stripe → API Gateway → Webhook Receiver → SQS → Webhook Processor Workers
                            │
                       (validate signature,
                        enqueue in < 200ms,
                        return 200)
```

The receiver does the minimum work necessary to return a 200 response to Stripe within its 30-second timeout. All business logic runs asynchronously in workers.

### Why Async?

- Stripe considers a webhook failed if our response takes > 30 seconds
- Business logic (DB writes, downstream calls) can take variable time
- SQS provides durability — events survive worker restarts

## Event Processing

### Receiver (Synchronous, < 200ms)

```python
@app.post("/api/v1/payment/stripe-webhook")
async def webhook_receiver(request: Request):
    payload = await request.body()
    signature = request.headers.get("stripe-signature")

    event = stripe.Webhook.construct_event(
        payload=payload,
        sig_header=signature,
        secret=settings.STRIPE_WEBHOOK_SECRET,
    )

    await sqs_client.send_message(
        QueueUrl=settings.WEBHOOK_QUEUE_URL,
        MessageBody=json.dumps({"event_id": event.id, "type": event.type, "data": event.data}),
        MessageGroupId=event.data.object.get("customer", "default"),  # FIFO ordering per customer
        MessageDeduplicationId=event.id,  # prevents duplicate processing
    )

    return {"received": True}   # 200 OK
```

### Worker (Asynchronous)

```python
def process_webhook_event(event_id: str, event_type: str, data: dict):
    # Idempotency check
    if db.processed_webhooks.exists(event_id):
        logger.info("Duplicate webhook ignored: %s", event_id)
        return

    handler = HANDLERS.get(event_type)
    if not handler:
        logger.debug("Unhandled event type: %s", event_type)
        return

    with db.transaction():
        handler(data)
        db.processed_webhooks.insert(event_id, processed_at=utcnow())
```

## Handlers

| Event Type | Handler | Side Effects |
|-----------|---------|-------------|
| `payment_intent.succeeded` | `handle_charge_succeeded` | Fulfill order, send receipt email, publish to SNS |
| `payment_intent.payment_failed` | `handle_charge_failed` | Trigger retry schedule, notify customer |
| `charge.refunded` | `handle_refund_completed` | Update refund status, notify customer |
| `customer.subscription.created` | `handle_subscription_created` | Activate subscription features |
| `customer.subscription.deleted` | `handle_subscription_cancelled` | Downgrade account, send offboarding email |
| `invoice.payment_failed` | `handle_invoice_failed` | Initiate subscription retry schedule |
| `invoice.payment_succeeded` | `handle_invoice_succeeded` | Extend subscription period |

## Retry Policy

Stripe retries failed webhook deliveries on an exponential schedule:
- 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours, 24 hours
- Total: 8 attempts over 3 days

If our endpoint returns a non-2xx response, Stripe retries. Since we return 200 immediately after enqueueing, this only happens on receiver-level failures (e.g., SQS unavailable).

Our worker has its own retry: SQS visibility timeout (30 minutes) with max 5 receive attempts. After 5 failures the message moves to the Dead Letter Queue (DLQ).

## DLQ Monitoring

DLQ alert fires when `ApproximateNumberOfMessagesVisible > 0` in the webhook DLQ. Investigation procedure:

```bash
# Inspect DLQ messages
aws sqs receive-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/<acct>/payments-webhook-dlq \
  --attribute-names All \
  --max-number-of-messages 10

# Replay from DLQ (after fixing the bug)
python scripts/replay_dlq.py --queue payments-webhook-dlq --target payments-webhook
```

## Webhook Signing Key Rotation

When rotating the Stripe webhook signing secret:

1. In Stripe Dashboard → Developers → Webhooks, click "Roll signing secret"
2. Note both the old and new secret — Stripe supports both during the transition window (24 hours)
3. Update `production/payment-service/stripe-webhook-secret` in Secrets Manager
4. Wait 15 minutes for ASCP to sync the new value to pods
5. Verify webhooks processing normally in Datadog
6. After 24 hours, the old secret expires automatically

## Related Documents

- Stripe Integration Guide
- Payment Service Architecture
- Refund Workflow Guide
