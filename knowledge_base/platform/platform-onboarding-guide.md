# Platform Onboarding Guide

**Author:** Sarah Chen
**Team:** Platform
**Last Updated:** 2026-02-10
**Tags:** onboarding, platform, developer-experience, getting-started, tooling

## Overview

This guide walks new engineers through setting up their development environment, accessing platform services, and understanding platform team conventions. Complete all steps in order on your first week.

## Access Provisioning (Day 1)

Submit an IT ticket with the `platform-access` template to request:

- [ ] AWS console access (read-only by default, write access requires manager approval)
- [ ] Kubernetes cluster access (`eks-staging` full, `eks-prod-primary` read-only)
- [ ] Datadog access (standard user)
- [ ] PagerDuty account linked to your work phone
- [ ] GitHub org membership (`engineering` team)
- [ ] Vault read access for your team's secret path

## Local Tooling Setup

### Required CLI Tools

```bash
# Install via homebrew (macOS)
brew install kubectl helm awscli k9s kubecolor linkerd

# AWS SSO login (run once, then daily after token expiry)
aws configure sso
# Profile: acmecorp-prod
# Region: us-east-1

# Verify cluster access
aws eks update-kubeconfig --name eks-staging --region us-east-1
kubectl get nodes
```

### kubectl Context Conventions

```bash
# Contexts set up by the IT bootstrap script
kubectl config get-contexts
# eks-staging       → pre-production cluster
# eks-prod-primary  → production cluster (read-only by default)
# eks-prod-dr       → DR cluster

# Use k9s for interactive cluster navigation
k9s --context eks-staging
```

## Repository Structure

All platform infrastructure is in the `platform-infra` GitHub repo:

```
platform-infra/
├── charts/           # Helm charts for all services
├── karpenter/        # Karpenter NodePool manifests
├── ingress/          # API Gateway and ingress configs
├── monitoring/       # Prometheus rules, Grafana dashboards
├── iam/              # IAM policies and IRSA role templates
├── scripts/          # Deployment and ops helper scripts
└── terraform/        # VPC, EKS, RDS, ElastiCache IaC
```

Application repos contain their own `charts/<service>/` directory. The platform team reviews and approves all Helm chart changes via GitHub PRs before merge.

## Deploying Your First Service

1. Build and push Docker image:
   ```bash
   docker build -t <ecr-registry>/<service>:$(git rev-parse --short HEAD) .
   docker push <ecr-registry>/<service>:$(git rev-parse --short HEAD)
   ```

2. Deploy to staging:
   ```bash
   helm upgrade --install <service> charts/<service> \
     --namespace staging \
     --set image.tag=$(git rev-parse --short HEAD) \
     --wait
   ```

3. Verify with `kubectl rollout status deployment/<service> -n staging`

4. Open a PR to promote the same image tag to production (CI enforces staging-first policy).

## Monitoring Checklist

Every new service must have:

- [ ] A Datadog service dashboard cloned from the `platform/service-dashboard-template`
- [ ] A `ServiceMonitor` in the Prometheus namespace scraping `/metrics`
- [ ] Alerting rules: error rate > 1% for 5 min, p99 latency > 2× SLO
- [ ] PodDisruptionBudget with `minAvailable: 50%`
- [ ] Resource requests on all containers

## Common Platform Commands

```bash
# List all deployments in production
kubectl get deployments -n production

# Get logs from a service (last 100 lines)
kubectl logs -l app=<service> -n production --tail=100

# Port-forward for local debugging
kubectl port-forward svc/<service> 8080:8080 -n staging

# Scale a deployment temporarily (for load testing)
kubectl scale deployment <service> --replicas=10 -n staging

# Check HPA status
kubectl get hpa -n production
```

## On-Call Ramp-Up

New engineers shadow on-call in weeks 3–6 with a senior buddy assigned. On-call rotation starts in month 3 after passing the Platform Certification quiz (link in Confluence).

Severity levels:
- **SEV1:** Customer-facing outage → page immediately
- **SEV2:** Degradation > 5 minutes → page within 15 min
- **SEV3:** Non-customer-impacting anomaly → handle during business hours

## Team Channels

| Slack Channel | Purpose |
|--------------|---------|
| `#platform-eng` | General team discussion |
| `#platform-oncall` | Active incident coordination |
| `#deployments` | Automated deploy notifications |
| `#infra-cost` | AWS spend tracking |

## Related Documents

- Kubernetes Deployment Guide
- Secrets Management Guide
- Redis Failover Runbook
- Platform SLO Policy
