# PCI-DSS Compliance Checklist

**Author:** Priya Patel
**Team:** Payments
**Last Updated:** 2025-10-01
**Tags:** pci-dss, compliance, security, payments, audit, card-data

## Overview

This checklist covers our PCI-DSS SAQ-A compliance posture for the payment service. We are a Level 4 merchant using Stripe's hosted card fields (Stripe.js), which means we never handle raw card data. Our compliance scope is limited to the systems that interact with Stripe APIs.

## Scope

**In scope:** Payment service, API gateway (for payment endpoints), Stripe webhook processor, secrets management for Stripe keys.

**Out of scope:** Any system that never touches payment API keys or Stripe data — user service, recommendation service, CDN, analytics.

## PCI-DSS Requirement Checklist

### Requirement 1: Network Security Controls

- [x] Payment service isolated in dedicated `payments` namespace with NetworkPolicy denying all ingress except from API gateway
- [x] No direct internet access from payment service pods
- [x] TLS 1.2 minimum enforced at ALB (TLS 1.3 preferred)
- [x] WAF rules active on payment endpoint paths
- [ ] **OPEN:** Quarterly firewall rule review — due 2026-01-15

### Requirement 2: Secure Configurations

- [x] All container images scanned with Trivy; critical CVEs block CI
- [x] No default credentials; secrets via AWS Secrets Manager only
- [x] Non-essential services not installed in payment service image
- [x] `readOnlyRootFilesystem: true` on all payment service containers

### Requirement 3: Protect Stored Account Data

- [x] We store NO raw PANs (Primary Account Numbers), CVCs, or full track data
- [x] Only Stripe payment method IDs are stored in our database
- [x] Database encrypted at rest with KMS CMK
- [x] Stripe customer IDs rotated on account deactivation

### Requirement 4: Protect Cardholder Data Transmission

- [x] Card data entered via Stripe.js (never touches our servers)
- [x] All API calls to Stripe over TLS 1.2+
- [x] Webhook endpoint enforces signature verification before processing

### Requirement 5: Protect Against Malware

- [x] Container images rebuilt weekly from upstream base images
- [x] Falco runtime security monitoring for suspicious process execution
- [x] No `eval()` or dynamic code execution in payment service

### Requirement 6: Develop Secure Systems

- [x] OWASP Top 10 reviewed in payment service code reviews
- [x] `detect-secrets` pre-commit hook blocks accidental key commits
- [x] SAST scan (Semgrep) runs on every PR touching payment service
- [x] Dependency vulnerability scan (Snyk) with automatic PR for updates
- [ ] **OPEN:** Annual penetration test — scheduled 2026-Q1

### Requirement 7: Restrict Access by Business Need

- [x] IRSA restricts payment service to only its Secrets Manager paths
- [x] No engineer has direct production database write access (go through app API only)
- [x] Stripe Dashboard access requires SSO + MFA

### Requirement 8: Identify Users and Authenticate Access

- [x] MFA enforced for all AWS console access
- [x] Stripe Dashboard requires Okta SSO
- [x] API gateway authenticates all requests via JWT before routing to payment service
- [x] Admin API requires additional service token beyond JWT

### Requirement 9: Restrict Physical Access

- [x] Runs on AWS managed infrastructure (AWS handles physical security)

### Requirement 10: Log and Monitor All Access

- [x] All payment API calls logged with correlation ID, user ID, amount
- [x] Stripe Dashboard audit log exported monthly to S3
- [x] CloudTrail enabled for all Secrets Manager access
- [x] Log retention: 1 year hot (CloudWatch), 7 years cold (S3 Glacier)

### Requirement 11: Test Security Regularly

- [x] Trivy scans in CI/CD pipeline
- [ ] **OPEN:** External penetration test — scheduled 2026-Q1
- [x] Stripe Radar rules reviewed quarterly by fraud team

### Requirement 12: Support Information Security with Policies

- [x] This document serves as the compliance documentation
- [x] Annual PCI training for all engineers with payment service access
- [x] Incident response policy covers payment data breaches

## SAQ-A Attestation

Last attestation: **2025-10-01**
Next attestation due: **2026-10-01**
Completed by: Priya Patel (Payments Team Lead)
Reviewed by: Legal & Compliance team

## Open Items Tracker

| Item | Due Date | Owner |
|------|---------|-------|
| Quarterly firewall rule review | 2026-01-15 | Tom Bradley (Platform) |
| Annual penetration test | 2026-Q1 | Security team |

## Related Documents

- Stripe Integration Guide
- Secrets Management Guide (Platform team)
- Payment Service Architecture
