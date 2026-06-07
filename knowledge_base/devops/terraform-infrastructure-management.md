# Terraform Infrastructure Management

**Author:** Ben Carter
**Team:** DevOps
**Last Updated:** 2026-01-05
**Tags:** terraform, infrastructure-as-code, aws, iac, devops, automation

## Overview

All AWS infrastructure is managed as code using Terraform. This guide covers the repository structure, workflow, state management, and conventions for making infrastructure changes safely.

## Repository Structure

```
platform-infra/terraform/
├── modules/              # Reusable Terraform modules
│   ├── eks-cluster/      # EKS cluster + node groups
│   ├── rds-postgres/     # RDS instance + parameter group
│   ├── elasticache/      # ElastiCache Redis cluster
│   ├── s3-bucket/        # S3 + lifecycle + encryption
│   ├── iam-irsa-role/    # IAM role for IRSA
│   └── vpc/              # VPC, subnets, NAT gateways
│
├── environments/
│   ├── production/       # Production AWS account
│   │   ├── eks.tf
│   │   ├── rds.tf
│   │   ├── elasticache.tf
│   │   ├── iam.tf
│   │   └── backend.tf    # S3 state backend
│   ├── staging/
│   └── dr/
│
└── global/               # Account-level resources (Route53, ACM)
    ├── dns.tf
    └── certificates.tf
```

## State Management

Terraform state is stored in S3 with DynamoDB locking:

| Environment | S3 Bucket | DynamoDB Table |
|-------------|----------|----------------|
| production | `acme-tf-state-prod` | `tf-locks-prod` |
| staging | `acme-tf-state-staging` | `tf-locks-staging` |

State is encrypted at rest (KMS) and versioned.

```hcl
# environments/production/backend.tf
terraform {
  backend "s3" {
    bucket         = "acme-tf-state-prod"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "arn:aws:kms:us-east-1:..."
    dynamodb_table = "tf-locks-prod"
  }
}
```

## Standard Workflow

### 1. Plan

```bash
cd terraform/environments/production

# Initialize (once per workstation / after provider updates)
terraform init

# Plan changes
terraform plan -out=tfplan -var-file=production.tfvars

# Review plan output carefully before proceeding
```

### 2. Review

Large infrastructure changes (new VPCs, EKS clusters, RDS instances) require:
- A PR with the `terraform plan` output attached
- Review by at least 2 DevOps team members
- Sign-off from the Platform team lead for changes affecting EKS or networking

### 3. Apply

```bash
# Apply the saved plan
terraform apply tfplan

# Verify resources in AWS Console after apply
```

**Never run `terraform apply` without a saved plan in production.** The plan ensures exactly the changes reviewed are applied.

### 4. Post-Apply

```bash
# Verify state is consistent
terraform plan  # Should show "No changes"

# Check AWS Console for expected resources
# Run smoke tests if applying EKS or RDS changes
```

## Module Conventions

### Naming

All resources use the pattern: `<env>-<component>-<purpose>`

Examples:
- `production-eks-primary` (EKS cluster)
- `production-rds-payments` (RDS instance)
- `staging-elasticache-redis` (ElastiCache)

### Tagging

All resources must have:
```hcl
tags = {
  Environment = var.environment
  Team        = var.team
  ManagedBy   = "terraform"
  Repository  = "platform-infra"
}
```

The `ManagedBy = "terraform"` tag prevents manual console changes (detected by drift detection and alerted to `#infra-drift`).

## Drift Detection

A weekly GitHub Action checks for configuration drift:

```bash
terraform plan -detailed-exitcode
# Exit code 2 = changes detected (drift)
```

Drift alerts notify the DevOps team in `#infra-drift`. Unexplained drift is investigated and either:
- Applied to Terraform if the manual change was intentional
- Reverted in AWS if unauthorized

## Sensitive Variables

Secrets are not stored in `.tfvars` files. They are fetched from AWS SSM Parameter Store at apply time:

```hcl
data "aws_ssm_parameter" "db_password" {
  name            = "/production/rds/admin-password"
  with_decryption = true
}

resource "aws_db_instance" "payments" {
  password = data.aws_ssm_parameter.db_password.value
  ...
}
```

## Related Documents

- CI/CD Pipeline Guide
- Kubernetes Deployment Guide (Platform team)
- Infrastructure Capacity Planning (Platform team)
- Cost Optimization Guide
