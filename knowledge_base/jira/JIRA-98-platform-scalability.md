# JIRA-98: Platform scalability — ECS operational friction and growth blockers

**Ticket ID:** JIRA-98
**Project:** CloudShop Platform
**Type:** Tech Debt / Initiative
**Priority:** P2 — High
**Status:** Closed (Resolved — superseded by ADR-001)
**Reporter:** Sarah Chen
**Assignee:** Sarah Chen
**Opened:** 2025-06-15
**Closed:** 2025-10-08 (ADR-001 accepted)
**Labels:** platform, ecs, eks, scalability, tech-debt, infrastructure
**Epic:** Platform Modernization H2 2025

---

## Summary

This ticket documents the accumulating operational friction caused by running CloudShop's microservices on Amazon ECS, and makes the case that this friction will compound as the service count grows. It is intended to drive a formal architectural decision (ADR) about the future of CloudShop's container orchestration platform.

Opened following the Q2 2025 Platform Engineering retrospective, where the team identified ECS limitations as the top source of unplanned toil.

---

## Background

CloudShop migrated from a monolith to three microservices in Q3 2023 and containerized them onto ECS in Q1 2024. ECS was the right choice at the time: the team was small, the service count was low, and the AWS-native experience reduced the operational learning curve during an already-complex migration.

By mid-2025, the context has changed significantly. We now have three production services with heterogeneous compute requirements, a growing set of compliance obligations, and a 2026 roadmap that includes at least three additional services. The constraints of ECS are showing up as recurring toil and as architectural blockers to things we want to build.

---

## Documented Pain Points

### Pain Point 1: Split cluster architecture for heterogeneous workloads

The recommendation-service requires memory-optimized compute (r6i instance family) for model serving. The payment-service and user-service run on general-purpose compute (m6i). ECS capacity providers don't support per-task node affinity in a way that's manageable without separate ECS clusters.

We currently operate two ECS clusters (`cloudshop-backend` for payment and user services, `cloudshop-ml` for recommendation-service). This duplication means:
- Two sets of Terraform modules to maintain
- Two sets of CloudWatch log groups, IAM roles, and capacity provider configurations
- No unified view of compute utilization across services
- Separate deployment pipelines with slightly different behavior (a source of recurring confusion during on-call)

**Estimated toil cost:** ~4 hours/week of Platform Engineering time managing inconsistencies between the two clusters.

### Pain Point 2: Security Group-based network isolation is not scalable

Service-to-service network isolation in ECS is enforced via Security Groups at the ENI level. This works, but it produces a matrix of Security Group rules that grows quadratically with service count. We currently have 14 Security Group rules to encode the allowed communication paths between three services. With six services (2026 roadmap), this becomes 36+ rules with no structural enforcement — just a spreadsheet and human review.

More importantly, Security Groups can't enforce namespace-level isolation. Any pod in the `cloudshop-backend` cluster can theoretically reach any other pod in that cluster if a Security Group is misconfigured. We want the payment-service to be isolated by default, with explicit allow rules for each approved caller.

**Specific incident:** In March 2025, a developer ran `ecs exec` directly on a payment-service production task to investigate a bug. This was not detectable via standard CloudTrail alerts and was only discovered during a quarterly access review. The correct behavior should be that production `exec` access to payment-service is not possible without explicit approval.

### Pain Point 3: Custom deployment tooling burden

Because ECS doesn't have Helm or a native concept of parameterized manifests, Platform Engineering wrote a custom Python-based deployment tool (`cloudshop-deploy`) to manage ECS task definition versioning, environment variable injection, and rolling deployments. This tool is ~2,400 lines of code and is the source of approximately one incident per quarter (most recently: JIRA-89, a deployment that silently failed to swap the task definition, leaving the old version running for 6 hours before anyone noticed).

The deployment tooling is also a hiring friction point. New engineers join expecting to use Helm or similar tools; onboarding them onto `cloudshop-deploy` takes 1–2 days and is a source of recurring frustration.

### Pain Point 4: Limited autoscaling precision

ECS autoscaling operates at the task level, but node group scaling (adding EC2 instances) is managed by separate Auto Scaling Groups with limited awareness of pending task requirements. We've observed cases where a burst of new tasks was scheduled on the wrong capacity provider, causing tasks to sit in PENDING for 3–5 minutes while the correct node type scaled up.

For the recommendation-service, this creates a meaningful user experience issue: if the service is fully scaled down overnight and traffic spikes early morning, new tasks wait for r6i instances to provision, during which time fallback recommendations (popular items) are served instead of personalized results.

### Pain Point 5: Ecosystem isolation

The CNCF ecosystem (Karpenter, cert-manager, External Secrets Operator, OpenTelemetry Operator, Argo CD, KEDA) is built for Kubernetes. Every tool evaluation in the past year has ended with "works great on Kubernetes, requires significant custom work on ECS." We're effectively maintaining a bespoke platform in an ecosystem that has converged on Kubernetes.

Recent examples of tools we wanted but couldn't adopt due to ECS:
- **cert-manager:** Automated TLS certificate rotation. ECS alternative: manual certificate rotation (currently rotated quarterly by Alex Kim, scheduled in a calendar reminder).
- **External Secrets Operator:** Dynamic secrets injection with audit trail. ECS alternative: baking secrets into task definitions at deploy time, which leaks secret values into CloudTrail deployment event logs.
- **OpenTelemetry Collector:** Standard telemetry pipeline. ECS alternative: custom Fluent Bit configuration that is consistently out of sync between the two clusters.

---

## 2026 Roadmap Impact

The 2026 product roadmap includes three new backend services:
- `cart-service` (shopping cart, high write throughput)
- `search-service` (Elasticsearch-backed product search)
- `notification-service` (email/push notifications, SQS-backed)

Each new service on ECS adds approximately:
- 1 new ECS cluster or cluster config (if compute requirements differ)
- 6–8 new Security Group rules
- ~400 lines of custom deployment tooling additions
- A new set of bespoke CloudWatch dashboards

The Platform Engineering team is 3 people. At the current rate, adding three new services on ECS would consume all of Platform Engineering's capacity for H1 2026, leaving nothing for reliability work, cost optimization, or developer experience improvements.

---

## Proposed Path

Formal evaluation of Amazon EKS as the replacement container orchestration platform. Expected outcomes:
- Unified single cluster for all services, with namespace-based isolation replacing cluster-based isolation
- Kubernetes NetworkPolicy replacing Security Group rules
- Helm replacing `cloudshop-deploy`
- Standard CNCF tooling replacing custom solutions
- Foundation for the 2026 service expansion without proportional Platform Engineering overhead

This ticket is a framing document; the formal decision will live in an ADR once the evaluation is complete.

---

## Comments

**2025-06-20 — Marcus Rivera:**
Strongly support this. The March `ecs exec` incident alone is enough reason to move — we can't audit production access to payment-service right now, which is a PCI-DSS problem waiting to be flagged. I've been manually writing scripts to parse CloudTrail for `ExecuteCommand` events; that should not be a manual process.

**2025-07-02 — Emily Torres:**
I've reviewed this with the CTO. The 2026 service expansion plan is the forcing function here — we need a scalable platform foundation before we start adding services, not after. Sarah, please drive the ADR process. We should have a decision by end of Q3 so we can plan the migration into Q4.

**2025-07-15 — Sarah Chen:**
Linking JIRA-101 (payment-service latency) here — it's not directly caused by ECS, but it's surfacing the same underlying pressure: the team is firefighting operational issues on a platform that requires too much custom work. JIRA-101's resolution (caching, ADR-002) is also informing the EKS evaluation, since Redis on EKS is cleaner than Redis + ECS from an IAM perspective.

**2025-08-28 — Alex Kim:**
I've completed a 2-week spike on EKS. Key findings:
- Migration to EKS is feasible with the dual-running ALB strategy (ECS + EKS in parallel during migration)
- Terraform module for EKS is ~60% less code than our current ECS modules
- cert-manager + External Secrets Operator work exactly as expected
- Karpenter is very promising for the recommendation-service scale-up problem but recommend we defer to post-migration
Spike notes shared in #eng-platform (2025-08-28 thread).

**2025-10-08 — Sarah Chen:**
ADR-001 accepted today. Closing this ticket. The migration plan is in [migrations/ecs-to-eks-migration.md](../migrations/ecs-to-eks-migration.md).

---

## Related Documents

- [ADR-001: Migrate to EKS](../adrs/ADR-001-migrate-to-eks.md)
- [JIRA-101: payment-service latency](./JIRA-101-payment-latency.md)
- [migrations/ecs-to-eks-migration.md](../migrations/ecs-to-eks-migration.md)
