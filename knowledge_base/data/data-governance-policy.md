# Data Governance Policy

**Author:** Nina Kowalski
**Team:** Data
**Last Updated:** 2025-10-15
**Tags:** governance, policy, pii, gdpr, ccpa, data-catalog, compliance

## Overview

This policy establishes data governance standards for all data assets owned or processed by the company. It covers data classification, ownership, access, PII handling, and regulatory compliance (GDPR, CCPA).

## Data Classification

All data assets must be classified at creation time in the data catalog:

| Class | Description | Examples | Access |
|-------|-------------|---------|--------|
| **Public** | No sensitivity | Product documentation, marketing copy | Anyone |
| **Internal** | Business use only | Aggregate metrics, company financials | Employees |
| **Confidential** | Sensitive business data | User behavior, revenue details | Need-to-know |
| **Restricted** | PII / regulated data | Name, email, payment info | Strict approval |

## Data Ownership

Every dataset must have a designated **Data Owner** (senior individual accountable for the data) and **Data Steward** (day-to-day manager). Both are recorded in the data catalog.

| Dataset | Owner | Steward |
|---------|-------|---------|
| `fact_payments` | VP Payments | Diana Chen |
| `dim_customer` | VP Product | Nina Kowalski |
| `fact_user_events` | VP Product | Ryan O'Brien |
| `raw.*` | CTO | Data team rotation |

## PII Handling Requirements

### GDPR (EU/EEA users)

- Users may request access to all PII held about them (Data Subject Access Request — DSAR)
  - DSAR must be fulfilled within 30 days
  - Tool: `scripts/gdpr_export.py --customer-id <id>`
- Users may request deletion of all PII (Right to Erasure)
  - Deletion must be complete within 30 days
  - Tool: `scripts/gdpr_delete.py --customer-id <id>`
  - Note: anonymized aggregate records are retained (no individual re-identification possible)
- Data must not leave the EEA without appropriate safeguards (Standard Contractual Clauses on file for AWS US regions)

### CCPA (California users)

- Users may opt out of data sale (we do not sell data — opt-out is a no-op but must be honored)
- Users may request deletion (same as GDPR process above)

### Retention Periods

| Data Type | Retention | Basis |
|-----------|-----------|-------|
| Raw PII (bronze zone) | 14 days | Minimum needed for reconciliation |
| Cleaned pseudonymized data | 2 years | Analytics value |
| Aggregate data (no PII) | 7 years | Financial record keeping |
| Audit logs | 7 years | Legal / compliance |
| Deleted user data | 0 days post-request | GDPR erasure |

## Access Request Process

1. Submit a Jira ticket with component `data-access-request`
2. Specify: dataset, purpose, required access level, duration
3. Data Owner approves/denies within 3 business days
4. Data team provisions access via IAM or Redshift role
5. Access automatically expires after 90 days unless renewed

## Data Quality SLA (as Governance Commitment)

All Restricted or Confidential datasets must maintain:
- Null rate on critical fields: < 0.1%
- Freshness: within SLA defined per dataset in the catalog
- Schema change notification: 5 business days advance notice to consumers

## Audit Trail

All access to Restricted data is logged via CloudTrail and Redshift audit logs. Quarterly access reviews identify and revoke stale permissions.

## Policy Violations

Violations (e.g., committing PII to source code, accessing data without approval) are escalated to Legal & Compliance within 24 hours and may result in disciplinary action.

## Related Documents

- ETL Pipeline Overview
- Data Retention and Archival Policy
- Data Catalog and Discovery Guide
- PCI-DSS Compliance Checklist (Payments team)
