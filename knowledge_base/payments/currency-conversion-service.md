# Currency Conversion Service Guide

**Author:** Alex Rivera
**Team:** Payments
**Last Updated:** 2025-10-20
**Tags:** currency, forex, payments, internationalization, exchange-rates

## Overview

The Currency Conversion Service provides real-time and cached exchange rates for multi-currency pricing, checkout display, and settlement reconciliation. It is an internal microservice called by the payment service and the frontend pricing API.

## Supported Currencies

Production supports 24 currencies for display pricing and 12 for actual charge processing (Stripe constraint):

**Chargeable currencies:** USD, EUR, GBP, CAD, AUD, JPY, CHF, SEK, NOK, DKK, SGD, HKD

**Display-only currencies:** BRL, MXN, INR, KRW, CNY, IDR, THB, MYR, PHP, PLN, CZK, HUF

For display-only currencies, customers see prices in their local currency but are charged in USD at checkout.

## Exchange Rate Data

Rates are sourced from the European Central Bank (ECB) daily feed (published 16:00 CET on weekdays) and the Open Exchange Rates API for non-ECB currencies.

**Update cadence:**
- ECB rates: refreshed daily at 16:30 UTC
- OER rates: refreshed every 4 hours
- Fallback: last known rate used if source is unavailable (stale rate alert fires after 6 hours)

**Rate storage:** Redis hash `forex:rates:<base_currency>` with TTL 8 hours

## API Reference

### GET /api/internal/currency/rate

```
GET /api/internal/currency/rate?from=USD&to=EUR
Authorization: Bearer <internal-service-token>
```

Response:
```json
{
  "from": "USD",
  "to": "EUR",
  "rate": 0.9234,
  "mid_rate": 0.9234,
  "timestamp": "2025-10-20T16:32:00Z",
  "source": "ecb",
  "is_stale": false
}
```

### POST /api/internal/currency/convert

Converts an amount:
```json
{
  "amount_cents": 10000,
  "from_currency": "USD",
  "to_currency": "EUR",
  "rounding": "up"
}
```

Response:
```json
{
  "original_amount_cents": 10000,
  "converted_amount_cents": 9234,
  "rate": 0.9234,
  "fee_bps": 150,
  "final_amount_cents": 9372
}
```

`fee_bps` (basis points) represents the forex conversion fee charged to the customer (1.5% for international cards). This fee is disclosed at checkout.

## Markup Policy

| Card Type | Markup | Notes |
|-----------|--------|-------|
| Domestic (USD) | 0 bps | No conversion |
| International (non-USD) | 150 bps | 1.5% conversion fee |
| High-volatility currencies | 250 bps | JPY, CHF, SEK |

Markup policy is owned by Finance and updated quarterly. Changes require a Finance team approval PR.

## Settlement Reconciliation

At end-of-day, the reconciliation service fetches the day's charge midrates for each currency pair used and calculates forex gain/loss for accounting. The midrate at charge time is stamped on each `payments` record as `fx_rate_at_charge`.

```sql
-- Daily forex P&L summary
SELECT 
  currency_pair,
  SUM(original_usd_amount_cents) as total_usd,
  SUM(charged_local_amount_cents) as total_local,
  AVG(fx_rate_at_charge) as avg_rate
FROM payments
WHERE DATE(settled_at) = CURRENT_DATE - 1
  AND currency != 'USD'
GROUP BY currency_pair;
```

## Rate Staleness Handling

If the rate feed has not updated for > 6 hours:

1. Alert fires to `#payments-ops` Slack channel
2. Service continues serving cached rates with `is_stale: true` flag
3. Payment API adds a banner to checkout: "Exchange rates may not reflect current market"
4. If stale for > 24 hours, the conversion service rejects requests and payments fall back to USD-only

## Related Documents

- Payment Service Architecture
- Stripe Integration Guide
- Payment Reconciliation Process
