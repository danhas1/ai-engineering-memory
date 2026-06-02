# Security Review: payment-service EKS Migration — PCI-DSS Compliance Assessment

**Document type:** Security Review / Compliance Assessment
**Review scope:** payment-service migration from Amazon ECS to Amazon EKS
**Review period:** 2025-11-10 to 2025-11-13
**Review lead:** David Lim (Head of Security, CloudShop)
**Technical reviewer:** Sarah Chen (Platform Engineering Lead)
**Compliance context:** PCI-DSS v4.0 (CloudShop is a Level 2 merchant; annual SAQ D assessment)
**Status:** Approved with conditions (see Section 5)
**Approval date:** 2025-11-13
**Related documents:**
- [ADR-001: Migrate to EKS](../adrs/ADR-001-migrate-to-eks.md)
- [migrations/ecs-to-eks-migration.md](../migrations/ecs-to-eks-migration.md)
- [architecture/current_architecture.md](../architecture/current_architecture.md)

---

## 1. Purpose

This document records the PCI-DSS compliance review conducted before migrating the payment-service from Amazon ECS to Amazon EKS. The review was a condition of ADR-001 approval, as stated in Emily Torres's review note: *"PCI-DSS compliance review has been scheduled with the security team before payment-service migration begins."*

The payment-service is in-scope for PCI-DSS because it:
- Receives, processes, and transmits cardholder data (PANs, CVVs at the point of intake, tokenized card references post-tokenization)
- Initiates payment authorization requests to Stripe using stored API keys with access to payment methods
- Stores idempotency keys that map to payment transactions (indirectly cardholder-linked)

Any infrastructure change to payment-service requires security review to ensure PCI-DSS control equivalence is maintained or improved.

---

## 2. Review Scope

This review evaluated whether the EKS configuration for payment-service meets or exceeds the PCI-DSS controls that were in place under ECS, covering:

- Network segmentation and access control
- Authentication and authorization
- Secrets management
- Audit logging and monitoring
- Encryption in transit and at rest
- Vulnerability management (container image)
- Incident response readiness

The review does **not** cover application-level PCI-DSS controls (e.g., cardholder data handling within the Java codebase), which are covered by the annual SAQ D assessment. This review is exclusively focused on the infrastructure layer change.

---

## 3. Control-by-Control Assessment

### 3.1 Network Segmentation (PCI-DSS Requirement 1)

**ECS baseline:** Network isolation enforced via AWS Security Groups. The payment-service ECS tasks ran in a dedicated security group (`sg-payment-prod`) that restricted inbound traffic to the ALB security group and the user-service security group only. All other inbound traffic was denied.

**EKS configuration:**

The `payments` Kubernetes namespace has the following NetworkPolicy applied:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: payment-service-ingress
  namespace: payments
spec:
  podSelector:
    matchLabels:
      app: payment-service
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    - namespaceSelector:
        matchLabels:
          name: users
  egress:
  - to:
    - ipBlock:
        cidr: 10.0.0.0/16  # VPC CIDR (RDS, Redis)
    - ipBlock:
        cidr: 0.0.0.0/0    # Stripe API, Sift API (external)
      ports:
      - port: 443
        protocol: TCP
```

**Assessment:** IMPROVEMENT over ECS baseline. Kubernetes NetworkPolicy provides deny-by-default network isolation at the pod level. The ECS Security Group approach was at the ENI level and required manual rule management. The EKS NetworkPolicy is enforced at the kernel level (iptables/eBPF via VPC CNI) and is expressed as code in version control.

**Open finding:** The egress rule `0.0.0.0/0:443` is broad. It allows payment-service pods to reach any external HTTPS endpoint, not just Stripe and Sift. Recommendation: restrict egress to the specific Stripe and Sift IP ranges. Sarah Chen noted that Stripe publishes a static IP list for API endpoints; Sift does not. This is logged as a finding but does not block the migration (the risk is accepted as equivalent to the current ECS posture, which has the same effective egress permission).

**Control status:** ✅ Meets requirement (with noted finding)

---

### 3.2 Authentication and Authorization (PCI-DSS Requirement 8)

**ECS baseline:** Compute access to payment-service ECS tasks was via ECS `exec` (AWS CLI), which required `cloudshop:ECSExec` IAM permission. This permission was granted to several engineers with `Developer` IAM roles, without restriction to non-production environments. The over-broad access was flagged in JIRA-98 and is a known gap.

**EKS configuration:**

Kubernetes RBAC is configured for the `payments` namespace:

```yaml
# Role: payment-service-readonly (for on-call debugging)
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log", "events"]
  verbs: ["get", "list", "watch"]

# Role: payment-service-deployer (for CI/CD)
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "update", "patch"]
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list"]
```

`kubectl exec` into payment-service pods in production requires the `payment-service-exec` ClusterRoleBinding, which is granted only to Priya Patel and Sarah Chen. All `kubectl exec` sessions are logged via the kube-apiserver audit log, which is streamed to CloudWatch Logs.

**Assessment:** IMPROVEMENT over ECS baseline. RBAC provides significantly more granular access control than the ECS IAM model. The audit log for `kubectl exec` is available without custom CloudTrail parsing. The over-broad ECS exec access (flagged in JIRA-98) is resolved by the EKS RBAC configuration.

**Control status:** ✅ Meets requirement

---

### 3.3 Secrets Management (PCI-DSS Requirement 3, 6)

**ECS baseline:** Secrets (Stripe API key, database credentials, Sift API key) were stored in AWS Secrets Manager and injected into ECS task definitions at launch time via the `secrets` stanza. The secret ARNs were visible in task definition JSON, which is stored in CloudTrail logs. This created a minor compliance concern: the ARN itself does not expose the secret value, but the existence of a named secret in a task definition log can reveal the structure of the cardholder data environment.

**EKS configuration:** Secrets are managed via the External Secrets Operator, which syncs secrets from AWS Secrets Manager into Kubernetes Secrets at runtime. The sync is performed by a service account with an IRSA role that has `secretsmanager:GetSecretValue` permission scoped to the specific payment-service secrets only.

Kubernetes Secrets are stored in etcd. The EKS etcd volume is encrypted at rest using AWS KMS (key: `cloudshop-eks-etcd-key`).

Secrets are mounted as environment variables into payment-service pods (not as files). This is consistent with the current ECS approach and is acceptable for PCI-DSS purposes.

**Open finding:** Kubernetes Secrets are base64-encoded, not encrypted, in the Kubernetes API layer (encryption at rest is at the etcd level). Engineers with `payment-service-readonly` RBAC can read pod environment variables via `kubectl describe pod`, which exposes secret values. This is a regression from the ECS model where secrets were not visible via task describe. **This is a blocking finding (see Section 5).**

**Control status:** ⚠️ Conditional — requires remediation before migration (see Section 5)

---

### 3.4 Audit Logging (PCI-DSS Requirement 10)

**ECS baseline:** CloudTrail for ECS API calls. CloudWatch Logs for application logs. No centralized audit trail for access to production compute.

**EKS configuration:**
- Kubernetes API server audit log enabled, streamed to CloudWatch Logs (`/aws/eks/cloudshop-prod/audit`)
- All `kubectl` operations (exec, delete, apply) against the `payments` namespace are logged with requester identity, timestamp, and resource
- Fluent Bit DaemonSet forwards application logs from all pods to CloudWatch Logs, with pod metadata (namespace, pod name, image tag) as structured fields
- Log retention: 365 days (for PCI-DSS Requirement 10.5: logs retained for at least 12 months)

**Assessment:** IMPROVEMENT over ECS baseline. The Kubernetes audit log provides a complete record of all control-plane operations, which was not available under ECS without custom CloudTrail parsing.

**Control status:** ✅ Meets requirement

---

### 3.5 Encryption in Transit (PCI-DSS Requirement 4)

**ECS baseline:** TLS enforced on ALB (public-facing). Inter-service communication (payment-service → user-service) was over HTTP within the VPC, relying on VPC network isolation rather than application-layer encryption.

**EKS configuration:**
- Public traffic: TLS terminated at ALB (ACM certificate); traffic from ALB to Ingress controller is HTTP within the VPC (same as ECS baseline).
- Inter-service gRPC: cert-manager issues TLS certificates for all services. payment-service → user-service gRPC connections use mutual TLS (mTLS) with certificates rotated automatically every 90 days.
- Redis connections: TLS enforced via ElastiCache in-transit encryption (set at cluster creation, ADR-002).
- Database connections: TLS enforced on RDS PostgreSQL connection string (sslmode=verify-full).

**Assessment:** IMPROVEMENT over ECS baseline. The adoption of mTLS for inter-service gRPC eliminates the HTTP-within-VPC gap from ECS. This is a meaningful security improvement that exceeds PCI-DSS requirements for network encryption.

**Control status:** ✅ Meets requirement

---

### 3.6 Container Image Security (PCI-DSS Requirement 6)

**Assessment:** Container images are built from a hardened base image (`eclipse-temurin:17-jre-jammy`) using a multi-stage Dockerfile that excludes build tools from the production image. Images are scanned by Amazon ECR image scanning (basic scan) on push and by Trivy in the CI pipeline.

No critical or high-severity CVEs were present in the payment-service image as of 2025-11-13.

The EKS Pod Security Standard (`restricted`) is enforced for the `payments` namespace:
- Pods run as non-root
- Read-only root filesystem enabled
- Privilege escalation disabled
- All capabilities dropped

**Assessment:** IMPROVEMENT over ECS baseline. ECS had no equivalent to Pod Security Standards. The `restricted` PSS provides strong container isolation guarantees.

**Control status:** ✅ Meets requirement

---

## 4. Summary of Control Changes

| Control Area | ECS Posture | EKS Posture | Change |
|---|---|---|---|
| Network segmentation | Security Groups (ENI-level) | NetworkPolicy (pod-level) | Improvement |
| Production exec access | Over-broad ECS exec permission | RBAC-gated, audit-logged kubectl exec | Improvement |
| Secrets visibility | Not visible via task describe | Visible in pod env vars (blocking finding) | Regression |
| Secrets storage | Secrets Manager → task definition | External Secrets Operator → etcd (KMS) | Equivalent |
| Audit logging | CloudTrail (limited) | k8s audit log + CloudWatch (comprehensive) | Improvement |
| Inter-service encryption | HTTP within VPC | mTLS (gRPC) | Improvement |
| Container hardening | No equivalent policy | Pod Security Standard (restricted) | Improvement |

---

## 5. Approval Conditions

The security review is **approved** for the payment-service EKS migration, subject to the following conditions being met before the migration begins:

**Condition 1 (Blocking): Kubernetes Secret visibility**

The `payment-service-readonly` RBAC role must be modified to remove the `pods` `get` verb, or the Secrets must be mounted as files from a tmpfs volume rather than environment variables, to prevent on-call engineers with read access from accidentally viewing secret values via `kubectl describe pod`.

**Preferred resolution:** Mount secrets as files in a read-once tmpfs volume. This is a 1-hour change. David Lim and Priya Patel to confirm resolution before migration start.

**Resolution:** Implemented 2025-11-14. Secrets are now mounted as files at `/etc/payment-service/secrets/` from a tmpfs volume. `kubectl describe pod` no longer exposes secret values in the environment variable section.

**Condition 2 (Non-blocking, logged): Stripe/Sift egress restriction**

The NetworkPolicy egress rule `0.0.0.0/0:443` should be narrowed to specific Stripe and Sift IP ranges. Stripe publishes stable egress IP ranges; Sift does not. This is logged as a finding and will be tracked as a hardening task post-migration (JIRA-112).

**Status:** JIRA-112 opened, assigned to Alex Kim. Due Q1 2026.

---

## 6. Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| Head of Security | David Lim | ✅ Approved | 2025-11-13 |
| Platform Engineering Lead | Sarah Chen | ✅ Approved | 2025-11-13 |
| Engineering Manager | Emily Torres | ✅ Acknowledged | 2025-11-13 |

*This review approval is valid for the payment-service EKS migration as described in migrations/ecs-to-eks-migration.md. Any material change to the EKS configuration (cluster version, network plugin, RBAC configuration, namespace structure) requires a delta review.*

---

## 7. Follow-Up Items

| # | Finding | Severity | Owner | Due | Status |
|---|---|---|---|---|---|
| F-001 | Secret visibility via `kubectl describe pod` | High (blocking) | Priya Patel | 2025-11-14 | Resolved |
| F-002 | Overly broad egress NetworkPolicy (`0.0.0.0/0:443`) | Medium | Alex Kim | 2026-01-31 | JIRA-112, In Progress |
| F-003 | ALB → Ingress traffic is HTTP (not HTTPS) within VPC | Low | Sarah Chen | 2026-Q2 | Accepted risk; evaluate with Istio (ADR-001) |
