# ECS-to-EKS Migration Retrospective

**Type:** Team Retrospective
**Date:** 2026-01-14 (held as a 90-minute video call)
**Facilitator:** Emily Torres (Engineering Manager)
**Participants:** Sarah Chen, Marcus Rivera, Priya Patel, James Okonkwo, Alex Kim
**Note-taker:** Alex Kim
**Related documents:**
- [ADR-001: Migrate to EKS](../adrs/ADR-001-migrate-to-eks.md)
- [migrations/ecs-to-eks-migration.md](../migrations/ecs-to-eks-migration.md)
- [incidents/payment-outage-postmortem.md](../incidents/payment-outage-postmortem.md)

**Context:** This retrospective is distinct from the November 2025 payment outage postmortem (INC-2025-047). The postmortem was an incident-focused document answering "what broke and why." This retrospective asks a broader question: how did the migration project go as a whole — process, teamwork, tooling, and organizational decisions — and what would we do differently next time?

---

## Format

This retrospective used a structured "4Ls" format: **Liked, Learned, Lacked, Longed For**, followed by a voted action item session.

---

## Liked: What went well

*These are things participants explicitly called out as positive and worth repeating.*

**Dual-running ALB strategy was the right call (unanimous)**

Every participant mentioned the weighted ALB target group approach as the best architectural decision of the migration. When the payment-service EKS pods failed on November 15, recovery time was reduced from "hours-long redeployment" to "minutes-long ALB weight change." The rollback path being a configuration change rather than a deployment is exactly the right design for a critical-path migration.

> *"The rollback working was the only reason November 15 wasn't a catastrophic multi-hour outage. We need to build that pattern into every future infrastructure migration." — Marcus Rivera*

**Migration order (lowest-risk first) was correct**

Starting with recommendation-service (lowest PCI-DSS scope, most tolerant SLO) and ending with payment-service (highest scope, tightest SLO) was the right sequencing. The recommendation-service and user-service migrations gave the team real EKS production experience before the highest-stakes service was migrated. The recommendation-service migration in particular surfaced the morning cold-start latency problem (JIRA-107), which we now know to address before the 2026 service expansion.

**Platform Engineering team communication during the incident**

Despite the stress of the November 15 outage, the team communication in #incidents and on the bridge was clear, calm, and focused. No finger-pointing in real-time. Marcus ran the incident bridge well. The postmortem was truly blameless.

**Helm charts significantly reduced deployment complexity**

Replacing the ~2,400-line custom ECS deployment tool (`cloudshop-deploy`) with standardized Helm charts was an immediate quality-of-life improvement. First deployment of recommendation-service to EKS took 45 minutes, compared to the half-day it used to take to set up a new ECS service from scratch.

---

## Learned: What we discovered during the migration

*New knowledge gained that wasn't obvious before starting.*

**Kubernetes resource limits require empirical validation against production load**

We knew resource requests and limits were important, but the November 15 incident made viscerally clear that staging load is not a reliable proxy for production load. The payment-service uses ~900Mi of JVM memory at 150 RPS; staging ran at 30 RPS and showed 320Mi. The difference is non-linear: JVM heap sizing, thread pool overhead, and Spring Boot initialization all scale with concurrency, not linearly with RPS.

Going forward: any service with a JVM (or other managed-memory runtime) must have resource limits validated under production-representative load, not staging load. This is now a migration gate.

**ADR review comments are not enforcement mechanisms**

Marcus Rivera flagged PodDisruptionBudgets in the ADR-001 review: *"Approved with the condition that we enforce PodDisruptionBudgets for all critical services before declaring the migration complete."* This comment was visible in the ADR. It was not translated into a runbook requirement or a blocking checklist item. It was bypassed.

This is an organizational learning: review comments in ADRs or design docs are not self-executing. Any requirement raised in a review must be converted to a tracked artifact (Jira ticket, runbook checklist item) to have teeth. Emily Torres took an action item to establish this as a process norm.

**Autoscaler behavior during migrations is a hidden risk category**

The interaction between the EKS Cluster Autoscaler and the ECS capacity provider autoscaler during the migration was not anticipated. Both autoscalers were making independent decisions based on their own utilization signals, and those decisions happened to collide at the worst possible moment. 

This category of risk — two independent automated systems making valid local decisions that produce a globally bad outcome — is hard to anticipate from first principles and easy to miss in a risk assessment. We should explicitly reason about "which automated systems are running and what decisions can they make simultaneously?" for any future infrastructure transition.

**PodDisruptionBudgets need to be set before traffic arrives, not after**

The migration runbook originally placed PDB creation in the post-migration validation phase. The rationale was that PDBs aren't meaningful without traffic. This turned out to be wrong: PDBs protect against eviction during migration itself, before the service has production traffic. The protection is needed from the moment the pods are scheduled.

**Karpenter was the right call to defer, but the Cluster Autoscaler morning cold-start issue was predictable**

Alex Kim raised the Karpenter deferral question during ADR-001 planning. The team decided correctly not to introduce Karpenter alongside the EKS migration. However, the morning cold-start latency problem for recommendation-service (JIRA-107) was foreseeable: we knew the recommendation-service required memory-optimized nodes that take longer to provision, and we knew traffic spikes happen in the morning. We should have set realistic expectations about cold-start behavior in the migration acceptance criteria rather than discovering it in production.

---

## Lacked: What was missing and hurt us

*Gaps, absences, or omissions that made the migration harder than it needed to be.*

**A resource limit standardization guide**

There was no documented standard for how to set memory/CPU requests and limits for each service type (JVM-based, Go-based, Python-based). Each team set their own, and Platform Engineering reviewed them in PRs but without clear criteria for what "correct" looked like. The recommendation-service Helm chart's `memory: 512Mi` limit was never challenged because no one had a reference to compare it against.

Action taken: Sarah Chen published the "Resource Limits by Service Type" guide in December 2025.

**A migration checklist that treated critical services differently**

The same migration runbook was used for recommendation-service, user-service, and payment-service. The steps were identical. A PCI-DSS-scoped, 99.95% SLO service has materially different risk tolerances than a 99.5% SLO service. The runbook did not reflect this.

Action taken: Marcus Rivera added a "critical service" section to the migration runbook with payment-service-specific gates: load test at production RPS, PDB pre-requisite, security review, and 72-hour parallel run before cutover.

**A pre-migration load test**

Every migration gate in the original runbook was a health check under low traffic. No gate required a load test. The EKS staging environment was not tested at production RPS before the payment-service migration began. This is the most direct cause of the November 15 incident: the resource limit issue would have been caught by a 20-minute load test at 150 RPS.

Action taken: Load test at ≥80% production peak RPS is now a mandatory migration gate before increasing ALB weight above 20%.

**Clear ownership of cross-cutting migration requirements**

Several migration requirements (PDB, resource limits, security review) were "known to Platform Engineering" but not formally assigned to a person to verify before migration day. On the morning of November 15, Alex Kim was executing the migration autonomously. There was no migration review sign-off from a second engineer. A two-person sign-off requirement for payment-service migration steps would have been a natural opportunity to catch the missing PDB.

Action taken: Critical service migrations now require two-engineer sign-off on the pre-migration checklist. Sarah Chen and Marcus Rivera must both approve before payment-service migration steps begin.

**Real-time visibility into Cluster Autoscaler decisions**

During the November 15 incident, the team spent 22 minutes (06:14–06:37) confused about why ECS went down at the same time as EKS. The root cause (autoscaler scaling down ECS nodes) was eventually found via CloudTrail. But there was no Grafana dashboard showing autoscaler scale-down events alongside payment-service error rate.

Action taken: Marcus Rivera added autoscaler events to the platform Grafana dashboard.

---

## Longed For: What would have made this much easier

*Things the team wished existed during the migration, not necessarily in-scope or actionable immediately.*

**A canary analysis tool (e.g., Flagger) for automated traffic shifting**

Multiple participants wished for automated canary analysis: a tool that compares EKS and ECS error rates and latencies and shifts traffic automatically based on configured acceptance criteria, rolling back automatically if a threshold is breached. With Flagger, the November 15 incident might have triggered an automatic rollback before the situation became a full outage.

Deferred: Flagger evaluation added to the 2026 Platform roadmap (JIRA-115, not scheduled).

**A drift detection tool to flag ECS vs. EKS configuration inconsistencies**

When Alex copied the recommendation-service Helm values to bootstrap the payment-service chart, there was no automated check that flagged the copied memory limits as potentially wrong. A tool that compares resource requests against observed production metrics (e.g., VPA — Vertical Pod Autoscaler in recommendation mode) would have surfaced the discrepancy before the migration.

Deferred: VPA in recommendation mode is being evaluated for the `cloudshop-prod` cluster (JIRA-116, planned Q2 2026).

**Dedicated EKS staging environment that mirrors production scale**

The EKS staging environment runs at 10% of production node capacity and is load-tested at 30 RPS. This was sufficient for recommendation-service and user-service but insufficient for payment-service. A staging environment that could run at full production scale (even briefly, for load testing) would have caught the resource limit issue.

Partially addressed: Alex Kim provisioned a short-lived full-scale EKS environment for the payment-service Attempt 2 load test in November. The cost was ~$45 for a 2-hour test. This is acceptable and will be standard practice for critical service migrations going forward.

---

## Action Items from Retrospective

| # | Action | Owner | Due | Status |
|---|---|---|---|---|
| 1 | Publish resource limits guide by service type (JVM, Go, Python) | Sarah Chen | 2025-12-15 | Done |
| 2 | Add two-engineer sign-off requirement to critical service migration checklist | Marcus Rivera | 2025-12-01 | Done |
| 3 | Add autoscaler event stream to platform Grafana dashboard | Marcus Rivera | 2025-12-10 | Done |
| 4 | Establish process: ADR review requirements → Jira tickets (not just ADR comments) | Emily Torres | 2026-01-31 | In Progress |
| 5 | Add JIRA-115 to Platform roadmap: Flagger canary analysis evaluation | Sarah Chen | 2026-02-01 | Backlog |
| 6 | Add JIRA-116 to Platform roadmap: VPA recommendation mode evaluation | Sarah Chen | 2026-02-01 | Backlog |
| 7 | Update the retrospective process: require a team retrospective (not just an incident postmortem) for all migrations that involve P1-scope services | Emily Torres | 2026-01-31 | Done |

---

## Overall Assessment

The ECS-to-EKS migration achieved its technical goals. All three services are running on EKS, the ECS infrastructure has been decommissioned, and the platform is in a better position for the 2026 service expansion than it would have been on ECS. The Helm-based deployment model, NetworkPolicy isolation, and IRSA-based IAM roles are meaningfully better than what we had.

The payment-service outage was a serious failure, and the 3-week slip was costly. But it happened because of specific, correctable process gaps — not because EKS was the wrong choice or because the migration strategy was fundamentally flawed. The dual-running approach worked as designed: the outage was serious, but it could have been catastrophic without the ECS rollback path.

The most important thing we're taking from this migration is a process discipline that we didn't have before: critical service migrations require more rigor than general service migrations, and that rigor has to be encoded in checklists and gates, not in tribal knowledge or ADR review comments.

> *"I'd run this migration again. I'd just run it with the runbook we have now, not the runbook we had then." — Sarah Chen*
