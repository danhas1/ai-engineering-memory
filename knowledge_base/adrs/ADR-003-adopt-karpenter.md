# ADR-003: Replace Cluster Autoscaler with Karpenter for Node Provisioning

**Status:** Accepted
**Date:** 2026-02-12
**Deciders:** Sarah Chen (Platform Engineering Lead), Alex Kim (DevOps Engineer), Marcus Rivera (Senior SRE)
**Supersedes:** N/A (Cluster Autoscaler never had a formal ADR — it was the EKS default)
**Superseded by:** N/A
**Related tickets:** JIRA-107 (recommendation-service cold-start latency), INC-2025-047 (payment outage — autoscaler contributing factor)
**Related ADRs:** ADR-001 (EKS migration; Cluster Autoscaler was explicitly chosen as the interim autoscaler with Karpenter deferred post-migration)

---

## Context

When CloudShop adopted EKS in late 2025 (ADR-001), the team made a deliberate choice to use the Kubernetes Cluster Autoscaler rather than Karpenter. The reasoning was sound at the time: Cluster Autoscaler is the battle-tested default, and introducing a second new technology alongside the EKS migration itself would have increased risk and cognitive load during an already-demanding change.

ADR-001 explicitly noted: *"Cluster Autoscaler initially, with Karpenter evaluated post-migration."*

The migration is now complete. Two specific problems have emerged in production that Cluster Autoscaler cannot address well and Karpenter is designed to solve.

### Problem 1: Slow node provisioning for recommendation-service scale events

The recommendation-service autoscales on a combination of CPU utilization and SQS queue depth (batch scoring requests). Scale events happen fastest during morning traffic ramp-up (~08:00–09:00 UTC) when the nightly model training has just completed and users begin browsing.

With Cluster Autoscaler, the node provisioning sequence is:
1. HPA triggers a scale event (new pods pending)
2. Cluster Autoscaler detects unschedulable pods
3. Cluster Autoscaler calls the Auto Scaling Group API to increase desired capacity
4. EC2 instance boots, registers with cluster, becomes schedulable
5. Pods are scheduled on the new node

**Observed provisioning time:** 3.5–5 minutes from unschedulable pod to running pod. During this window, recommendation-service serves popular-item fallback results rather than personalized recommendations.

JIRA-107 (opened January 2026) documented 4 SLO near-misses in January where recommendation-service availability dipped below 99.6% (SLO: 99.5%) due to slow scale-up during morning traffic. The team wants to reduce provisioning time to under 60 seconds.

### Problem 2: Node lifecycle management contributing to the November 2025 payment outage

The November 2025 payment outage (INC-2025-047) was caused by a combination of factors, one of which was the Cluster Autoscaler making a scale-down decision at an inopportune time. Cluster Autoscaler's scale-down logic is based on node utilization thresholds with a configurable cool-down period. During the payment-service EKS migration, the autoscaler's scale-down timer fired based on overnight utilization patterns and evicted pods at the moment they were most vulnerable (partially migrated, no PodDisruptionBudget).

While the root fix was adding PodDisruptionBudgets (which Karpenter also respects), the incident revealed that Cluster Autoscaler's node lifecycle decisions are not sufficiently aware of workload-specific scheduling constraints. Karpenter's provisioner model — which provisions nodes to exactly match pending pod requests rather than maintaining generic node pools — would have been less likely to over-provision and then aggressively scale back.

### Problem 3: Node group rigidity for heterogeneous workloads

Cluster Autoscaler requires pre-defined node groups (AWS Auto Scaling Groups) with fixed instance types. CloudShop currently maintains two node groups:
- `general`: m6i.2xlarge (for payment-service and user-service)
- `memory-optimized`: r6i.2xlarge (for recommendation-service)

This is manageable with three services but will become rigid as new services are added in 2026. A `cart-service` with burst write patterns and a `search-service` with memory-intensive query processing will likely need yet another node group with different instance characteristics.

Karpenter's `NodePool` and `EC2NodeClass` model allows node provisioning decisions to be made per-pod based on resource requests and node selectors, without requiring pre-defined ASGs. A single `NodePool` with a set of allowed instance types can satisfy heterogeneous workloads by selecting the right instance for each pod at provision time.

---

## Decision

**We will replace the Kubernetes Cluster Autoscaler with Karpenter as the node lifecycle management solution for `cloudshop-prod`.**

Key implementation decisions:

1. **Karpenter replaces Cluster Autoscaler entirely.** We will not run both in parallel long-term. Running both creates a risk of conflicting provisioning and termination decisions. Cluster Autoscaler will be decommissioned once Karpenter is validated in production.

2. **Two NodePools replacing two node groups:**
   - `general-pool`: Allows `m6i`, `m6a`, `m7i`, `m7a` instance families (cost-optimized by allowing multiple comparable families). Used for payment-service and user-service.
   - `ml-pool`: Allows `r6i`, `r7i` instance families. Uses `nodeAffinity` taint for recommendation-service pods. Consolidation enabled during off-peak hours.

3. **Spot instances for recommendation-service training jobs.** The recommendation-service nightly training CronJob is interruptible — training runs can restart from a checkpoint. Karpenter will provision Spot instances for the `batch` workload class (defined via a label selector), with automatic fallback to On-Demand if Spot capacity is unavailable. Estimated cost savings: ~65% on training node costs.

4. **Karpenter consolidation enabled for non-critical workloads.** Karpenter's node consolidation feature (bin-packing pods onto fewer nodes after scale-down) will be enabled for the `recommendations` and `users` namespaces, where minor disruption is acceptable. Consolidation is disabled for the `payments` namespace — combined with the `payment-service` PodDisruptionBudget, this guarantees payment-service pods are never disrupted by consolidation.

5. **Migration performed with Cluster Autoscaler scaled to zero replicas (not deleted) during validation.** This allows a fast rollback (scale Cluster Autoscaler back to 1 replica) during the 2-week validation window.

---

## Alternatives Considered

### Option A: Tune Cluster Autoscaler parameters (scale-down delay, utilization thresholds)

**Rejected as a long-term solution.** Tuning can reduce the frequency of the provisioning-speed problem but cannot eliminate the fundamental architecture (polling-based, ASG-constrained). The morning scale-up latency is a structural limitation of the Cluster Autoscaler's ASG dependency, not a configuration issue. We would be solving the symptom, not the cause.

**Accepted as a short-term mitigation:** We increased the Cluster Autoscaler scale-down delay from 10 minutes to 30 minutes in December 2025 to reduce the risk of premature scale-down events like the one that contributed to INC-2025-047. This does not reduce provisioning speed.

### Option B: Pre-warm nodes via scheduled scaling

**Rejected.** Scaling up nodes before they are needed (based on historical traffic patterns) reduces provisioning latency but wastes money on idle compute. Recommendation-service traffic patterns vary meaningfully on weekends and during sale events. Pre-warming based on a fixed schedule would require constant recalibration and would over-provision during low-traffic periods.

### Option C: KEDA (Kubernetes Event-Driven Autoscaling) for HPA replacement

**Partially adopted, not a replacement for Karpenter.** KEDA and Karpenter solve different problems. KEDA improves pod scaling decisions (scaling based on SQS queue depth, rather than CPU alone). Karpenter improves node provisioning decisions. Both can and should be used together. KEDA for recommendation-service queue-based scaling is being evaluated as a separate initiative (JIRA-109, not yet scheduled).

### Option D: Stay on Cluster Autoscaler and accept the recommendation-service cold-start latency

**Rejected on business grounds.** James Okonkwo escalated JIRA-107 after January's SLO near-misses. The recommendation-service SLO (99.5%) exists as a lower target than payment-service specifically because personalized recommendations are best-effort. But the morning cold-start issue means we're consistently in fallback mode during the highest-traffic period of the day, which directly impacts click-through rates and basket size. The business impact of slow scale-up is measurable.

---

## Consequences

### Positive
- Node provisioning time reduced from ~4 minutes to target of <60 seconds (based on Karpenter benchmarks and Alex Kim's spike results in staging).
- Spot instance support for batch training workloads: estimated $800–$1,100/month savings on recommendation-service training node costs.
- Flexible instance type selection: adding new services no longer requires defining new ASGs.
- Consolidation eliminates idle nodes during off-peak hours: estimated $300–$400/month savings from overnight consolidation.
- Explicit `payments` namespace consolidation exclusion gives a stronger safety guarantee for the payment-service than the current Cluster Autoscaler tuning.

### Negative / Risks
- **Operational learning curve:** Karpenter's `NodePool` and `EC2NodeClass` CRDs are new abstractions. The Platform team has validated them in staging but has no production experience. Mitigation: 2-week parallel period with Cluster Autoscaler at zero replicas (not deleted), allowing fast rollback.
- **Spot instance interruption for training jobs:** Spot instances can be interrupted with a 2-minute warning. The training pipeline must implement checkpointing to avoid losing a full night's training run on an interruption. James Okonkwo has confirmed this is implemented (checkpoint after each epoch); verification is a go-live gate.
- **Karpenter consolidation and PodDisruptionBudgets:** Consolidation respects PDBs, but this must be verified in production for each service. If a PDB is misconfigured, consolidation could cause unexpected pod evictions.

---

## Implementation Timeline

| Date | Milestone |
|---|---|
| 2026-01-20 | Alex Kim completes Karpenter staging validation; JIRA-107 linked |
| 2026-02-12 | ADR-003 accepted |
| 2026-02-14 | Karpenter installed in `cloudshop-prod`; NodePools configured |
| 2026-02-14 | Cluster Autoscaler scaled to 0 replicas (not deleted) |
| 2026-02-15 | First production node provisioned by Karpenter |
| 2026-02-16 | Recommendation-service morning scale-up observed; provisioning time: 48 seconds |
| 2026-02-28 | 2-week validation window complete; no incidents; Cluster Autoscaler Deployment deleted |
| 2026-03-01 | Spot instance NodePool activated for recommendation-service training CronJob |
| 2026-03-15 | Consolidation enabled for `recommendations` and `users` namespaces |

---

## Review Notes

*2026-02-12 — Marcus Rivera:* Approved. I want to be explicit that the `payments` namespace must have consolidation disabled in the Karpenter NodePool configuration, not just the PDB. Belt and suspenders for payment-service availability.

*2026-02-12 — Alex Kim:* Approved. Staging results look great — provisioning time in staging with a cold cluster was 44 seconds vs. our 4-minute Cluster Autoscaler baseline. I'll document the NodePool YAML specs in the platform runbook.

*2026-02-12 — Sarah Chen:* Approved. This is the last major infrastructure change before we start the 2026 service expansion. Once Karpenter is stable, we should be in a good position to onboard `cart-service` and `search-service` without adding new ASGs.
