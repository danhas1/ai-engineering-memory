# Archived Slack Thread: #incidents — Payment Service Outage, November 15, 2025

**Channel:** #incidents
**Incident:** INC-2025-047
**Thread date:** 2025-11-15
**Archived by:** Alex Kim (2025-11-17, for postmortem record)
**Context:** This is the real-time communication thread from the #incidents channel during the November 15, 2025 payment-service outage. It captures the raw timeline of discovery, diagnosis, and recovery as it happened — before the formal postmortem analysis. It is preserved because it contains engineering reasoning and decision context that the postmortem summarizes but doesn't fully replicate.

---

## Thread

---

**PagerDuty** [Bot] — 2025-11-15 06:15:12 AM

🔴 **ALERT TRIGGERED** — `payment-service-error-rate-high`
Service: payment-service | Severity: P1
Error rate: 100.0% (threshold: 0.05%)
Duration: 1m 0s
Runbook: https://wiki.internal/runbooks/payment-service
Assigned to: Marcus Rivera

---

**Marcus Rivera** — 06:15 AM

Acknowledged. Pulling up Grafana. @Priya Patel paging you in now, this looks bad.

---

**Marcus Rivera** — 06:16 AM

Payment-service error rate is 100%. Zero healthy pods in the ALB target group. This is a complete outage. Opening war room bridge: meet.google.com/cloudshop-incidents

---

**Priya Patel** — 06:22 AM

On the bridge. What do we have?

---

**Marcus Rivera** — 06:22 AM

All payment-service pods are either OOMKilled or Pending. We're in the EKS migration window — Alex started the payment-service migration at 5:30. The EKS pods are crashing, and ECS looks like it's draining. Both sides are broken at the same time.

---

**Priya Patel** — 06:23 AM

Oh no. Are we fully down? Is anyone processing payments right now?

---

**Marcus Rivera** — 06:23 AM

Correct. Zero successful payment transactions since 06:14. ALB has no healthy targets.

---

**Alex Kim** — 06:24 AM

I'm here. The EKS pods are OOMKilling — I can see in kubectl that the memory limit is 512Mi and the pods are being killed as soon as traffic hits them. I think I copied the wrong resource limits from the recommendation-service template. @Marcus Rivera — ECS drain should be finishing any second. Can you check the ECS target group?

---

**Marcus Rivera** — 06:24 AM

Checking... ECS tasks 4 and 5 are still DRAINING. Task 6 just came healthy. 2 of 6 healthy.

---

**Priya Patel** — 06:25 AM

What's our first priority — fix the EKS pods or get ECS back to 100%?

---

**Marcus Rivera** — 06:25 AM

Get ECS stable first. That's faster. Alex, stop touching the EKS side for now.

---

**Alex Kim** — 06:25 AM

Agreed, hands off EKS. Watching ECS drain.

---

**Marcus Rivera** — 06:26 AM

ECS is at 4/6 healthy now. Error rate dropping from 100% to ~60%. Still bad but recovering.

---

**Emily Torres** — 06:27 AM

On the bridge. Notifying Support and Customer Success now. Status page update?

---

**Marcus Rivera** — 06:27 AM

Yes please. Draft: "We are currently experiencing an issue affecting payment processing. Our team is actively investigating. We will provide an update within 15 minutes."

---

**Emily Torres** — 06:28 AM

Posted to status page. DM'ing the Head of Support now.

---

**Marcus Rivera** — 06:30 AM

ECS is at 6/6 healthy. Error rate is back below 1%. We're recovering. Customers can process payments again.

Bridge update: We're in degraded state — all traffic on ECS, EKS still broken. The immediate fire is out. Let's stabilize before diagnosing the EKS issue.

---

**Priya Patel** — 06:30 AM

Ok. @Alex Kim what exactly is the EKS memory limit set to?

---

**Alex Kim** — 06:31 AM

512Mi. I can see in the Helm values file I used the recommendation-service values.yaml as a starting template and didn't update the memory limit. Recommendation-service pods use about 320Mi. Payment-service is using ~900Mi at production load.

I feel terrible about this.

---

**Priya Patel** — 06:32 AM

This is not the time for that. Can you push a fix to the Helm values?

---

**Alex Kim** — 06:33 AM

Yes. Changing to requests: 1Gi / limits: 1.5Gi. Pushing now.

---

**Marcus Rivera** — 06:35 AM

While Alex works on the EKS fix — I want to understand why ECS went down too. That's not just the EKS pods failing. Something happened to ECS at the same moment.

---

**Marcus Rivera** — 06:37 AM

Found it. Looking at CloudTrail and the ECS events. At 06:14, the Cluster Autoscaler scaled down a node that had 3 ECS tasks running. Those tasks drained. That's why we went to zero — the ECS side got hit by the autoscaler at exactly the same time the EKS side failed.

So the autoscaler killed ECS nodes at 06:14 (scale-down cool-down from overnight). And EKS pods were already OOMKilling. Worst possible timing.

---

**Priya Patel** — 06:38 AM

Did we have a PodDisruptionBudget on the payment-service EKS pods?

---

**Alex Kim** — 06:38 AM

...No. I knew we were supposed to add one. It's on the migration checklist but it's in the "before declaring the migration complete" section, not the "before starting the migration" section. I thought we'd add it after the 72-hour observation window.

---

**Marcus Rivera** — 06:40 AM

That's the runbook gap. We need to add PDB as a prerequisite step, not a post-migration step. Note for the postmortem.

---

**Alex Kim** — 06:55 AM

EKS pods with corrected memory limits are up. 6/6 healthy. They're passing health checks.

---

**Marcus Rivera** — 06:58 AM

I'm watching the EKS error rate. Looks clean — p99 about 175ms, error rate <0.01%. 

Should we start shifting traffic back to EKS gradually or wait?

---

**Priya Patel** — 06:59 AM

Wait. I want at least 30 minutes of stable EKS behavior before we put any traffic on it. And we need to add the PDB first.

---

**Marcus Rivera** — 07:00 AM

Agreed. Alex, add the PDB now while EKS is at 0% traffic. `minAvailable: 4` given 6 replicas.

---

**Alex Kim** — 07:01 AM

PDB applied. `payment-service` PodDisruptionBudget: `minAvailable: 4`. 

---

**Marcus Rivera** — 07:01 AM

Updating the incident status. Full outage duration: 06:14 to 06:30 (16 minutes of full down, then degraded). Actually wait — we were at 0 healthy targets from 06:14 to 06:24 (ECS finished draining). So 10 minutes of true zero availability. Then 06:24 to 06:30 was partial ECS recovery. I'll be precise in the postmortem.

*[Note: The postmortem later calculated the correct duration as 47 minutes full outage, accounting for the ECS recovery being slower than Marcus estimated in real-time. Several ECS tasks experienced cold-start latency and error rates remained above the SLO threshold until 07:01 UTC.]*

---

**James Okonkwo** — 07:05 AM

Following along. Recommendation-service is fine — it calls user-service for preference data but not payment-service directly. We had some elevated user-service timeouts (~30 per minute) during the peak incident period, probably due to retry storms from clients, but nothing that triggered alerts on our side.

---

**Emily Torres** — 07:10 AM

Good. Support queue has ~140 tickets so far about payment failures. I'm going to ask the team to start processing those proactively — refund the convenience fees on any failed transactions we can identify. @Priya Patel can we generate a list of failed transaction IDs from 06:14–06:30?

---

**Priya Patel** — 07:12 AM

Yes. Running a query on the `payment_transactions` table now — looking for transactions with status `FAILED` and timestamp between 06:14 and 07:01. Will send to you and the Support lead within the hour.

---

**Marcus Rivera** — 07:45 AM

Bridge status: ECS is at 100% traffic. EKS is stable at 0% but healthy. No new alerts. Beginning 30-minute observation period before we attempt to re-introduce EKS traffic.

Incident is in "degraded / observing" state. Core team can step back; I'll ping if anything changes.

---

**Emily Torres** — 07:47 AM

Thanks everyone. Status page updated: "Payment processing has been restored. We are monitoring for stability." Let's not close the incident page until we've reconfirmed EKS stability.

---

**Marcus Rivera** — 09:15 AM

EKS has been healthy at 100% traffic for 75 minutes. p99 steady at ~178ms. Error rate 0.003%. Incident resolved.

INC-2025-047 closed. Post-mortem scheduled for 2025-11-22. I'll send a calendar invite.

@Alex Kim please don't delete the botched Helm values — I want them as an exhibit in the postmortem.

---

**Alex Kim** — 09:16 AM

Kept. Everything's in git history anyway.

---

**Marcus Rivera** — 09:18 AM

One more thing before we close: I'm going to update the migration runbook today to make PDB creation a hard prerequisite for any service migration, not a post-migration checklist item. And I'm going to add a gate that requires a load test at production-representative RPS before we increase ALB weight above 20%. 

These changes should have been in the runbook. That's on Platform Engineering, including me.

---

**Priya Patel** — 09:20 AM

Agreed. Also, we need a standard resource limit baseline by service type. "Copy from another service's template" is clearly not a safe practice. I'll raise this for the postmortem action items.

---

**Emily Torres** — 09:22 AM

Good work everyone. Ugly morning but we recovered well. Postmortem in a week — let's make sure we have a complete timeline for it.

---

*Thread archived. 8 participants. No messages deleted.*
