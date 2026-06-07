# Real-Time Streaming Pipeline Guide

**Author:** Ryan O'Brien
**Team:** Data
**Last Updated:** 2025-12-10
**Tags:** streaming, kinesis, kafka, flink, real-time, data-pipeline

## Overview

The real-time streaming pipeline processes user events, payment transactions, and system metrics in near-real-time (< 30 second end-to-end latency). It powers live dashboards, fraud detection signals, and product feature telemetry.

## Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Event ingestion | Kinesis Data Streams | Application event intake |
| Message bus | Apache Kafka (MSK) | Internal event routing |
| Stream processing | Apache Flink (EMR) | Stateful computations |
| Serving layer | DynamoDB | Real-time aggregates |
| Monitoring | Datadog + CloudWatch | Lag and throughput |

## Data Flow

```
Application Events (SDK)
         │
         ▼
Kinesis Data Streams
  - payments-events (5 shards)
  - user-events (10 shards)
  - system-metrics (3 shards)
         │
         ▼
Kinesis Firehose → S3 Bronze Zone (raw backup)
         │
Kafka Connect → MSK Topics
  - payments.processed
  - users.sessions
  - users.feature_usage
         │
         ▼
Flink Jobs (EMR Serverless)
  - session_aggregator
  - revenue_rollup
  - funnel_tracker
         │
         ▼
DynamoDB Tables (real-time)        Redshift (batch sync, 5-min delay)
  - live_revenue                     - fact_user_events
  - active_sessions                  - agg_hourly_revenue
  - funnel_states
```

## Kinesis Streams

### Shard Scaling

Auto-scaling is managed by the `kinesis-auto-scaler` Lambda triggered by CloudWatch:
- Scale out when `PutRecord.Throttled` > 100/minute
- Scale in when utilization < 20% for 30 consecutive minutes
- Scale-in cooldown: 15 minutes

```bash
# Check shard utilization
aws kinesis describe-stream-summary \
  --stream-name payments-events \
  --query 'StreamDescriptionSummary.{Shards:OpenShardCount,ConsumerCount:ConsumerCount}'

# Manual shard update
aws kinesis update-shard-count \
  --stream-name payments-events \
  --target-shard-count 8 \
  --scaling-type UNIFORM_SCALING
```

### Event Schema

All events follow the company event envelope:

```json
{
  "event_id": "uuid",
  "event_type": "payment.charge.succeeded",
  "timestamp": "2025-12-10T14:23:41.123Z",
  "source_service": "payment-service",
  "customer_id": "cust-uuid",
  "payload": { ... event-specific fields ... },
  "schema_version": "1.2"
}
```

Schema registry is hosted at `https://schema-registry.internal`. All producers must register their schema before publishing.

## Flink Jobs

### Session Aggregator

Computes real-time session metrics using Flink's event-time processing with a 30-minute session window:

```java
DataStream<SessionStats> sessions = userEvents
    .keyBy(e -> e.customerId)
    .window(EventTimeSessionWindows.withGap(Time.minutes(30)))
    .process(new SessionStatsProcessFunction());
```

Output: DynamoDB `active_sessions` table, updated every 10 seconds.

### Revenue Rollup

Tumbling 1-minute windows summing payment amounts:

```java
DataStream<RevenueSnapshot> revenue = paymentEvents
    .filter(e -> e.status.equals("succeeded"))
    .keyBy(e -> e.currency)
    .window(TumblingEventTimeWindows.of(Time.minutes(1)))
    .reduce(new RevenueReducer());
```

Output: DynamoDB `live_revenue` table — powers the live revenue counter on executive dashboards.

## Latency SLAs

| Pipeline Stage | Target | P99 Actual |
|---------------|--------|-----------|
| App → Kinesis | < 100ms | 45ms |
| Kinesis → Kafka | < 1s | 300ms |
| Kafka → Flink | < 2s | 800ms |
| Flink → DynamoDB | < 5s | 2.1s |
| End-to-end | < 30s | 14s |

## Lag Monitoring

```bash
# Check Kinesis consumer lag
aws cloudwatch get-metric-statistics \
  --namespace AWS/Kinesis \
  --metric-name GetRecords.IteratorAgeMilliseconds \
  --dimensions Name=StreamName,Value=payments-events \
  --statistics Maximum \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 60

# Check Kafka consumer group lag
kafka-consumer-groups.sh \
  --bootstrap-server msk-broker.internal:9092 \
  --describe \
  --group flink-session-aggregator
```

## Recovery Procedures

### Re-processing Historical Data

Kinesis retains events for 7 days. To re-process:

```bash
# Set Flink checkpoint to specific timestamp
flink savepoint <job-id> /tmp/savepoint

# Restart job from specific timestamp
flink run -s hdfs:///checkpoints/<timestamp> \
  target/flink-job.jar \
  --start-timestamp "2025-12-09T00:00:00Z"
```

## Related Documents

- ETL Pipeline Overview
- Data Warehouse Architecture
- Data Quality Framework
