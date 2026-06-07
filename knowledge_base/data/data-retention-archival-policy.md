# Data Retention and Archival Policy

**Author:** Diana Chen
**Team:** Data
**Last Updated:** 2025-10-01
**Tags:** retention, archival, s3, glacier, policy, gdpr, data

## Overview

This policy defines how long each category of data is retained, when it is archived to cold storage, and when it is permanently deleted. The policy balances legal requirements, cost optimization, and analytics needs.

## Retention Schedule

### Operational Data (Application Databases)

| Data Type | Hot Retention (RDS) | Archive (S3 Glacier) | Delete |
|-----------|--------------------|--------------------|--------|
| Payment transactions | 2 years | Years 3–7 | Year 7 |
| Refund records | 2 years | Years 3–7 | Year 7 |
| User accounts (active) | Until account closed | — | 30 days post-closure |
| User accounts (closed) | 30 days | 1 year | 1 year post-closure |
| Authentication logs | 90 days | 1 year | 1 year |
| API access logs | 90 days | 1 year | 1 year |

### Data Lake

| Zone | Hot (S3 Standard) | Warm (S3-IA) | Cold (Glacier) | Delete |
|------|-----------------|-----------|--------------|----|
| Bronze (raw) | 14 days | 30 days | — | Day 45 |
| Silver (cleaned) | 1 year | Year 2 | Years 3–7 | Year 7 |
| Gold (aggregated) | 2 years | Years 3–5 | Years 6–7 | Year 7 |
| ML artifacts | 1 year (active) | 1 year (retired) | — | 2 years |

### Analytics / Warehouse

| Dataset | Redshift (live) | S3 Parquet archive | Delete |
|---------|---------------|-------------------|--------|
| `fact_payments` | 2 years rolling | Years 3–7 | Year 7 |
| `fact_user_events` | 1 year rolling | Years 2–3 | Year 3 |
| `agg_*` tables | 3 years rolling | — | Year 3 |

## S3 Lifecycle Rules

All S3 lifecycle rules are managed as Terraform in `infra/terraform/s3_lifecycle.tf`.

Example lifecycle configuration for the Silver zone:
```hcl
resource "aws_s3_bucket_lifecycle_configuration" "silver_zone" {
  bucket = aws_s3_bucket.data_lake.id

  rule {
    id     = "silver-zone-lifecycle"
    status = "Enabled"
    filter { prefix = "clean/" }

    transition {
      days          = 365
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 730
      storage_class = "GLACIER"
    }
    expiration {
      days = 2555  # 7 years
    }
  }
}
```

## GDPR / CCPA Deletion Process

When a user requests erasure:

1. Run the deletion pipeline within 30 days of request:
   ```bash
   python scripts/gdpr_delete.py \
     --customer-id <id> \
     --request-date 2025-10-01 \
     --verify
   ```

2. The script:
   - Deletes or pseudonymizes PII fields in RDS
   - Deletes the customer row from `dim_customer` (SCD2 — invalidates all versions)
   - Removes raw rows from S3 bronze zone (14-day window only)
   - Marks Silver/Gold records with `is_deleted=true` (aggregate data is retained in anonymized form)

3. Log the deletion in the GDPR audit table for compliance records

4. Send confirmation to the customer within the 30-day window

**Note:** Financial records (payment transactions) are retained per legal requirement (7 years) even after erasure, but customer PII within those records is replaced with pseudonymous identifiers.

## Archival Verification

Quarterly, the data team runs `scripts/retention_audit.py` to verify:
- No data exceeds its retention limit
- All lifecycle rules are active
- Deletion logs match actual data state

## Cost Impact

S3 storage costs by tier (approximate per TB/month):
- Standard: $23
- Standard-IA: $12.50
- Glacier Instant Retrieval: $4
- Glacier Deep Archive: $0.99

Lifecycle rules save approximately $12,000/month versus keeping all data in S3 Standard.

## Related Documents

- Data Governance Policy
- ETL Pipeline Overview
- Data Warehouse Architecture
