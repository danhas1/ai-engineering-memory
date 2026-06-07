# CI/CD Pipeline Guide

**Author:** Ben Carter
**Team:** DevOps
**Last Updated:** 2026-01-20
**Tags:** cicd, github-actions, docker, deployment, automation, devops

## Overview

All services use a standardized CI/CD pipeline built on GitHub Actions and ArgoCD. The pipeline enforces quality gates at every stage: tests must pass, images must be scanned, and staging must succeed before production deploys.

## Pipeline Stages

```
Code Push / PR
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  CI (GitHub Actions — .github/workflows/ci.yml)             │
│                                                              │
│  1. Lint (ruff / eslint)                                    │
│  2. Unit + Integration Tests                                │
│  3. Build Docker Image                                      │
│  4. Trivy Container Scan (block on CRITICAL CVEs)           │
│  5. Push to ECR (tagged with git SHA)                       │
│  6. Smoke Test against ephemeral environment                │
└─────────────────────────────────────────────────────────────┘
    │ (on merge to main)
    ▼
┌─────────────────────────────────────────────────────────────┐
│  CD to Staging (ArgoCD Auto-Sync)                           │
│                                                              │
│  1. ArgoCD detects new image in ECR                         │
│  2. Updates Helm values: image.tag = <sha>                  │
│  3. Deploys to staging namespace                            │
│  4. Runs E2E test suite                                     │
│  5. Updates deployment status in GitHub                     │
└─────────────────────────────────────────────────────────────┘
    │ (manual approval gate)
    ▼
┌─────────────────────────────────────────────────────────────┐
│  CD to Production (ArgoCD Manual Sync)                      │
│                                                              │
│  1. Engineer approves deployment in ArgoCD UI or GitHub     │
│  2. Helm upgrade with --atomic                              │
│  3. Deployment health check (30s grace period)              │
│  4. Slack notification to #deployments                      │
└─────────────────────────────────────────────────────────────┘
```

## GitHub Actions Workflow

### ci.yml

```yaml
name: CI
on:
  push:
    branches: [main, 'release/**']
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r requirements-dev.txt
      - run: ruff check .
      - run: pytest tests/ --cov=src --cov-fail-under=80

  build-and-scan:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.CI_ROLE_ARN }}
          aws-region: us-east-1
      - uses: aws-actions/amazon-ecr-login@v2
      - name: Build and push
        run: |
          IMAGE=${{ env.ECR_REGISTRY }}/${{ env.SERVICE }}:${{ github.sha }}
          docker build -t $IMAGE .
          docker push $IMAGE
      - name: Trivy scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.ECR_REGISTRY }}/${{ env.SERVICE }}:${{ github.sha }}
          severity: CRITICAL
          exit-code: 1
```

## ArgoCD Application

Each service has an ArgoCD `Application` manifest in `infra/argocd/applications/`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: payment-service
  namespace: argocd
spec:
  source:
    repoURL: https://github.com/acmecorp/platform-infra
    path: charts/payment-service
    targetRevision: main
    helm:
      valueFiles: [values-production.yaml]
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true      # reverts manual kubectl changes
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
```

## Image Promotion

Image tags in `charts/<service>/values-production.yaml` are updated automatically by the CI pipeline for staging, and by a manual PR for production:

```bash
# Update production image tag (creates a PR)
scripts/bump-image-tag.sh payment-service $SHA

# ArgoCD auto-syncs staging; production requires approval
```

## Environment Variables

All non-secret environment variables are in `charts/<service>/values-production.yaml`. Secrets come from AWS Secrets Manager via ASCP. Never put secrets in values files.

## Deployment Notifications

A Slack notification is sent to `#deployments` for every:
- Successful production deployment
- Failed production deployment (with error context)
- Rollback event

## Related Documents

- Kubernetes Deployment Guide (Platform team)
- Container Security Scanning Guide
- Deployment Rollback Runbook
- Incident Response Process
