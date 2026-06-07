# Container Security Scanning Guide

**Author:** Zoe Nguyen
**Team:** DevOps
**Last Updated:** 2025-12-15
**Tags:** security, container, trivy, docker, vulnerability, cve, devops

## Overview

Container security scanning is integrated at three points in the delivery pipeline: during local development, in CI before image push, and continuously in production via periodic rescans. This guide covers the tooling, thresholds, and remediation process.

## Scanning Tools

| Tool | Stage | Purpose |
|------|-------|---------|
| Trivy | CI (GitHub Actions) | Image vulnerability scan (CRITICAL blocks deploy) |
| Trivy | CI | Dockerfile misconfiguration scan |
| Falco | Production runtime | Anomalous process/syscall detection |
| ECR Inspector | Post-push | Continuous vulnerability monitoring in registry |

## CI Scan (Trivy)

Every Docker build in CI runs Trivy before the image is pushed to ECR:

```yaml
# .github/workflows/ci.yml
- name: Trivy vulnerability scan
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ${{ env.IMAGE_TAG }}
    format: table
    severity: 'CRITICAL,HIGH'
    exit-code: '1'          # Block pipeline on CRITICAL
    ignore-unfixed: true    # Skip CVEs without a fix yet

- name: Trivy config scan (Dockerfile)
  uses: aquasecurity/trivy-action@master
  with:
    scan-type: config
    scan-ref: .
    severity: 'HIGH,CRITICAL'
    exit-code: '1'
```

### Severity Policy

| Severity | CI Action | Remediation SLA |
|----------|-----------|----------------|
| CRITICAL | Block pipeline | Must fix before merge |
| HIGH | Block pipeline | Must fix before merge |
| MEDIUM | Warning (non-blocking) | Fix within 30 days |
| LOW | Informational only | Best effort |

### Ignoring False Positives

If a CVE is a false positive or has no fix available, add to `.trivyignore`:

```
# CVE-YYYY-NNNNN — false positive, does not affect our usage
# Issue: https://github.com/xxx/yyy/issues/nnn
CVE-2024-12345
```

`.trivyignore` entries require review by a DevOps team member and must include a justification comment.

## Base Image Policy

All production services must use approved, hardened base images from the internal registry:

| Use Case | Approved Base Image | Rebuild Cadence |
|----------|--------------------|----|
| Python services | `registry.internal/python:3.12-slim-hardened` | Weekly |
| Node.js services | `registry.internal/node:20-alpine-hardened` | Weekly |
| Go services | `registry.internal/golang:1.23-distroless` | Weekly |
| Java services | `registry.internal/eclipse-temurin:21-jre` | Weekly |

Hardened images:
- Remove unnecessary package managers
- Run as non-root user (UID 1000)
- Set `read-only` root filesystem
- Minimal process set

**Using non-approved base images requires a security exception approved by the DevOps lead.**

## Dockerfile Best Practices

```dockerfile
# Use pinned, hardened base image (not :latest)
FROM registry.internal/python:3.12-slim-hardened@sha256:abc123

# Run as non-root
USER app:app

# Don't install dev dependencies in production image
RUN pip install --no-cache-dir -r requirements.txt

# Use COPY not ADD (avoids auto-extraction of archives)
COPY --chown=app:app src/ /app/

# No secrets in image
# Bad: COPY .env /app/.env
# Good: Use Secrets Manager via ASCP

# Minimal exposed ports
EXPOSE 8080
```

## Runtime Security (Falco)

Falco runs as a DaemonSet on all EKS nodes and detects:
- Process spawning in a container that wasn't in the original image
- File writes to unexpected locations
- Network connections to unexpected destinations
- Privilege escalation attempts

Falco rules are in `infra/falco/rules/`. Custom rules added by the security team.

Alert routing: `falco.syslog` → Datadog Log Management → PagerDuty for HIGH-severity violations.

## ECR Continuous Scanning

AWS Inspector continuously scans all ECR images for new CVEs as they are disclosed. When a new CRITICAL CVE affects a deployed image:

1. Inspector triggers an SNS notification
2. DevOps team receives a Slack alert in `#security-alerts`
3. Remediation SLA: 48 hours to rebuild + redeploy

## Monthly Security Summary

The DevOps team publishes a monthly container security summary to `#security-updates` covering:
- New CVEs found and remediated
- Images rebuilt due to base image updates
- Falco alerts and investigation outcomes
- Exceptions granted

## Related Documents

- CI/CD Pipeline Guide
- Kubernetes Deployment Guide (Platform team)
- Secrets Management Guide (Platform team)
