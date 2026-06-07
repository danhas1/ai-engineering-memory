# Secrets Management Guide

**Author:** Lisa Park
**Team:** Platform
**Last Updated:** 2026-01-05
**Tags:** secrets, aws-secrets-manager, kubernetes, security, vault, platform

## Overview

All production secrets (database credentials, API keys, TLS private keys) must be stored in AWS Secrets Manager and injected into pods at runtime via the AWS Secrets and Configuration Provider (ASCP) and the Kubernetes Secrets Store CSI Driver. Hard-coded secrets in source code or container images are prohibited and will trigger a CI build failure via the `detect-secrets` pre-commit hook.

## Secret Storage Policy

| Secret Type | Storage Backend | Rotation |
|------------|----------------|----------|
| Database passwords | AWS Secrets Manager | 30 days (automatic) |
| API keys (third-party) | AWS Secrets Manager | Manual, 90 days |
| TLS certificates | AWS Certificate Manager | Auto-renewed (ACM) |
| Internal service tokens | AWS Secrets Manager | 7 days |
| Encryption keys (KMS) | AWS KMS | Automatic rotation |

## Creating a New Secret

```bash
# Create a new secret
aws secretsmanager create-secret \
  --name "production/payment-service/stripe-api-key" \
  --secret-string '{"api_key": "sk_live_..."}' \
  --tags Key=Team,Value=Payments Key=Service,Value=payment-service Key=Environment,Value=production

# Verify creation
aws secretsmanager describe-secret \
  --secret-id "production/payment-service/stripe-api-key"
```

**Naming convention:** `<environment>/<service>/<secret-name>`

## Injecting Secrets into Pods

### Method 1: Secrets Store CSI Driver (Preferred)

Create a `SecretProviderClass` manifest:

```yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: payment-service-secrets
  namespace: production
spec:
  provider: aws
  parameters:
    objects: |
      - objectName: "production/payment-service/stripe-api-key"
        objectType: "secretsmanager"
        jmesPath:
          - path: api_key
            objectAlias: stripe-api-key
  secretObjects:
    - secretName: payment-service-stripe
      type: Opaque
      data:
        - objectName: stripe-api-key
          key: STRIPE_API_KEY
```

Reference in the pod spec:
```yaml
volumes:
  - name: secrets-store
    csi:
      driver: secrets-store.csi.k8s.io
      readOnly: true
      volumeAttributes:
        secretProviderClass: payment-service-secrets
env:
  - name: STRIPE_API_KEY
    valueFrom:
      secretKeyRef:
        name: payment-service-stripe
        key: STRIPE_API_KEY
```

### Method 2: External Secrets Operator (for bulk sync)

For services with many secrets, use the External Secrets Operator to sync an entire Secrets Manager path:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: payment-service-all
  namespace: production
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: payment-service-secrets
  dataFrom:
    - extract:
        key: production/payment-service
```

## Secret Rotation

Automatic rotation is enabled for database passwords using the AWS-managed Lambda rotation function. When rotation occurs:

1. Secrets Manager calls the rotation Lambda
2. Lambda creates a new password in the database
3. Lambda updates the secret value in Secrets Manager
4. Within 1 hour, pods restart rolling to pick up the new value (controlled by ASCP sync interval)

**Critical:** Rotation requires `AWSCURRENT`, `AWSPENDING`, and `AWSPREVIOUS` label support in your application — your DB connection must tolerate a brief window where both old and new passwords are valid.

## Access Control (IAM)

Each service has a dedicated IAM role bound via IRSA (IAM Roles for Service Accounts):

```bash
# View secrets accessible by a service's IRSA role
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::<account>:role/payment-service-irsa \
  --action-names secretsmanager:GetSecretValue \
  --resource-arns arn:aws:secretsmanager:us-east-1:<account>:secret:production/payment-service/*
```

The least-privilege policy template is at `infra/iam/service-role-policy.json.tpl`.

## Audit and Compliance

AWS CloudTrail logs all `GetSecretValue` calls. Security team reviews anomalous access patterns via Datadog SIEM dashboards weekly. Any secret accessed by an unexpected principal triggers a P2 alert to the security team.

## Emergency Secret Rotation

If a secret is compromised:

1. Immediately rotate in Secrets Manager (console or CLI)
2. Trigger rolling restart of all affected services
3. Revoke the old credential at the source (Stripe dashboard, database, etc.)
4. File a security incident via `#security-incidents` Slack channel

```bash
# Force immediate rotation
aws secretsmanager rotate-secret \
  --secret-id "production/payment-service/stripe-api-key" \
  --rotate-immediately

# Restart affected pods
kubectl rollout restart deployment/payment-service -n production
```

## Related Documents

- Platform Onboarding Guide
- Kubernetes Deployment Guide
- PCI-DSS Compliance Checklist (Payments team)
