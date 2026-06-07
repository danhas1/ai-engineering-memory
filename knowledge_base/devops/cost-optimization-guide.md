# Cost Optimization Guide

**Author:** Ben Carter
**Team:** DevOps
**Last Updated:** 2025-12-28
**Tags:** cost, aws, optimization, spot, savings-plan, devops, finops

## Overview

This guide covers AWS cost optimization strategies implemented by the DevOps team. We track cost monthly and target a cloud efficiency ratio (revenue / cloud spend) of at least 15:1.

## Current Monthly AWS Spend (November 2025)

| Service | Monthly Cost | % of Total | Trend |
|---------|-------------|-----------|-------|
| EC2 / EKS nodes | $18,200 | 42% | Stable |
| RDS (PostgreSQL) | $4,800 | 11% | Stable |
| ElastiCache (Redis) | $2,100 | 5% | ↑ (growth) |
| S3 + Data Transfer | $3,400 | 8% | ↓ (lifecycle rules) |
| Bedrock (AI/ML) | $5,600 | 13% | ↑ (new feature) |
| CloudWatch + Logs | $1,800 | 4% | Stable |
| Other | $7,600 | 17% | — |
| **Total** | **$43,500** | 100% | |

## Compute (EC2 / EKS)

### Spot Instances

60% of Karpenter-managed compute nodes run on Spot Instances:
- `general` pool: 70% Spot (interruptible, non-critical workloads)
- `compute` pool: 80% Spot (batch ML inference jobs)
- `memory` pool: 0% Spot (Redis, stateful — On-Demand required)

Spot savings vs. On-Demand: approximately **$8,000/month**.

### Savings Plans

We use Compute Savings Plans (3-year, no-upfront) for the baseline On-Demand capacity:
- $8,000/month commitment
- Estimated annual savings vs. On-Demand: $28,000

Savings Plans are reviewed and renewed by Finance + DevOps annually in October.

### Right-Sizing

Monthly automated right-sizing analysis via AWS Compute Optimizer:

```bash
# Get EC2 recommendations
aws compute-optimizer get-ec2-instance-recommendations \
  --filters name=Finding,values=OVER_PROVISIONED \
  --query 'instanceRecommendations[*].{Instance:instanceArn,Finding:finding,Savings:recommendationOptions[0].projectedUtilizationMetrics}'
```

Q4 2025 actions taken:
- Downsized RDS from db.r6g.xlarge → db.r6g.large ($800/month saved)
- Downsized 8 worker nodes from m6i.2xlarge → m6i.xlarge ($1,200/month saved)

### Karpenter Cost Tags

All Karpenter-provisioned nodes are tagged for cost allocation:
```yaml
labels:
  karpenter.sh/nodepool: general
  team: platform
  cost-center: engineering
```

Kubecost reads these labels for per-team cost reports.

## Storage

### S3 Intelligent-Tiering

Enabled on all buckets with mixed access patterns. Savings: approximately **$1,400/month** based on access frequency analysis.

### S3 Lifecycle Policies

Data lifecycle rules (from Data Retention Policy) automatically move objects to cheaper storage classes. Current savings from lifecycle policies: **$2,800/month**.

### EBS Volume Cleanup

Monthly script identifies and deletes detached EBS volumes:
```bash
aws ec2 describe-volumes \
  --filters Name=status,Values=available \
  --query 'Volumes[*].{VolumeId:VolumeId,Size:Size,Created:CreateTime}' \
  --output table
```

Unclaimed volumes older than 7 days are deleted automatically by the `cleanup-orphaned-ebs` Lambda.

## Database

### RDS Reserved Instances

Production RDS instances are covered by 1-year Reserved Instance commitments. Renewal scheduled for November each year.

### Aurora Serverless Consideration

Q1 2026 plan: Evaluate migrating the `recommendation-service` database to Aurora Serverless v2 for cost savings during off-peak hours (low traffic overnight).

## Alerting on Cost Anomalies

AWS Cost Anomaly Detection alerts fire when daily spend increases > 20% vs. 7-day average:

- Alert → Slack `#infra-cost`
- Anomaly > $500/day → Email to VP Engineering

## Cost Review Meeting

Monthly cost review on the first Monday of each month:
- Attendees: DevOps team, VP Engineering, Finance
- Agenda: cost vs. budget, anomalies, optimization actions
- Output: updated cost forecast + action items

## Related Documents

- Infrastructure Capacity Planning (Platform team)
- Terraform Infrastructure Management
- ADR-003: Adopt Karpenter
