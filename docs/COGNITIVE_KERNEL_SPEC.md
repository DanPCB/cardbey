# Cardbey AI Operating Kernel — Constitutional Specification

**Status:** Kernel Freeze declared (Phase 0)  
**Version:** 0.1.0  
**Date:** 2026-07-09  

This document is the **Cognitive Constitution** for Cardbey. It replaces ad-hoc “Performer routing” as the authority for how missions are perceived, decided, and reasoned about before execution.

### Constitutional documents (read in order)

| # | Document | Answers |
|---|----------|---------|
| 1 | [`PLATFORM_CONSTITUTION.md`](./PLATFORM_CONSTITUTION.md) | What is Cardbey? Platform philosophy. |
| 2 | **This document** — `COGNITIVE_KERNEL_SPEC.md` | How does Cardbey understand the world? |
| 3 | [`EXECUTION_KERNEL_V1_CERTIFICATION.md`](./EXECUTION_KERNEL_V1_CERTIFICATION.md) | How does Cardbey execute work? |

**Governance:** Kernel-touching PRs require [`CONSTITUTION_REVIEW.md`](./CONSTITUTION_REVIEW.md). Plugin maturity is tracked in [`MISSION_PLUGIN_STATUS.md`](./MISSION_PLUGIN_STATUS.md).

---

## 1. What this is (and is not)

| This is | This is not |
|---------|-------------|
| An AI operating kernel | A chat assistant workflow |
| A plugin host for perception, experience, reasoning, missions | A collection of `if (loyalty)` branches |
| A time-aware reality model | A one-shot input → output pipeline |
| Immutable boundaries + replay | Interpretation polluted at ingest |

**Performer** (console, chat, upload UI) is a **surface**. The **kernel** is the authority.

---

## 2. Kernel Freeze (effective immediately)

Until Phase 1+ wiring is explicitly approved:

1. **No new mission-specific routing in Performer intake.**
2. **No new `if (loyalty|campaign|store|…)` outside plugin registration.**
3. **All new capabilities** extend the kernel via registries — not `performerIntakeV2Routes.js`.
4. **Phase 0 only:** types, registries, laws, ingress stubs — **no behavior change** to production paths.

Bug fixes in Performer are allowed only when they unblock kernel ingress (e.g. context handoff), not when they add family logic.

---

## 3. The two laws

### Law 1 — Reality Stream is immutable

> Nothing may mutate events already recorded on a Reality Stream.  
> Every interpretation is derived from the stream and can be regenerated.

### Law 2 — Mission Contract is immutable

> Everything after Mission Contract freeze may execute.  
> Nothing after freeze may reinterpret the user's goal or mission family.

### Structural invariant — One spine

> One mission → one evidence view → one contract → one living execution graph → one asset family → one publish pipeline → one mission state.

No parallel checkpoint + topology + ui-action spines for the same `missionId`.

### Stabilization invariants (V1)

The production migration now enforces these runtime invariants:

1. **One intake gate**
   - Attachment turns must pass `Reality Stream -> Perception -> EvidenceView` before classification.
   - If evidence is not ready, Performer must return `awaiting_perception`.

2. **One frozen mission contract**
   - After compile handoff, `missionFamily`, `storeId`, and `evidenceId` are frozen in `missionContract`.
   - Resume and execution paths must consume the frozen contract, not re-derive family/context.

3. **One spine per mission**
   - Compiler-owned missions cannot fall back to checkpoint / unified legacy dispatch.
   - Spine ownership is persisted and asserted before dispatch.

4. **One canonical runtime state machine**
   - External runtime state vocabulary is limited to:
     `awaiting_perception | awaiting_context | awaiting_approval | awaiting_owner_input | executing | completed | failed`
   - Legacy mission statuses may still exist internally, but API/UI contracts must expose canonical runtime state.

5. **One artifact completion authority**
   - A mission is not `completed` unless its expected artifact exists and is usable.
   - Missing expected artifacts must surface as `failed` or a waiting state, never false completion.

---

## 4. The circular kernel

Most AI systems: **Input → Output**

Cardbey kernel:

```text
Reality Stream → … → Act → Publish → Reality Stream (new events) → …
```

Publishing, inventory changes, campaign go-live, loyalty enrollment, signage updates — all **append events** to the stream. The next mission selects a **window** over an evolving world.

---

## 5. Pipeline (final)

```text
REALITY STREAM (append-only events)
        │
        ▼
PERCEPTION (mutable, versioned plugins)
        "What might exist in this window?"
        │
        ▼
EXPERIENCE + KNOWLEDGE (consulted by reasoning only)
        Experience = learned platform patterns
        Knowledge  = imported domain facts
        │
        ▼
REASONING (mutable, versioned)
        "What does it mean? What methods fit?"
        │
        ▼
ALTERNATIVES (observable ranked missions)
        │
        ▼
DECISION (select or clarify)
        │
        ▼
MISSION CONTRACT (immutable)
        │
        ▼
EXECUTION CONTEXT RESOLVER
        │
        ▼
LIVING EXECUTION GRAPH (structure frozen; state evolves)
        │
        ▼
CONTRACT VERIFICATION
        │
        ▼
CAPABILITY RUNTIME (family-agnostic)
        │
        ▼
BUSINESS ASSETS (immutable published versions)
        │
        ▼
SUITCASE + PUBLISHING
        │
        └──► append REALITY STREAM events
```

---

## 6. Immutable vs mutable objects

### Immutable (frozen at defined points)

| Object | Frozen when | Purpose |
|--------|-------------|---------|
| **Reality Stream** | Each event on append | Source of truth for what happened |
| **Evidence View** | Selected for a mission lineage | Frozen query over stream — not copied facts |
| **Mission Contract** | Decision confirmed | Execution authority |
| **Living Execution Graph** | Structure at verify time | Capability DAG (topology) |
| **Business Asset** | Publish | Deliverable version |

### Mutable (versioned, replayable)

| Object | Notes |
|--------|-------|
| Perception frames | Re-run from stream window + plugin version |
| Reasoning frames | Re-run from evidence view + experience |
| Alternatives list | Output of reasoning |
| Execution draft / owner input | Mutates graph **state**, not contract |
| Graph node status | `pending` / `needs_input` / `completed` |

---

## 7. Core types (summary)

Implementation: `apps/core/cardbey-core/src/lib/kernel/types.ts`

### Reality Stream

Append-only events. Missions select `[fromEventId, toEventId]` or time bounds.

```typescript
RealityStreamEvent {
  eventId, streamId, recordedAt,
  kind: 'user_upload' | 'user_message' | 'store_signal' | 'order' | 'publish' | ...,
  payloadRef, observations[]  // raw detector output, no mission opinion
}
```

### Evidence View (not a copy)

```typescript
EvidenceView {
  evidenceId, realityStreamId,
  window: { fromEventId, toEventId } | { fromTime, toTime },
  eventIds[], observationIds[],
  queryVersion, selectionReason,
  frozenAt
}
```

### Mission Contract

```typescript
MissionContract {
  contractId, frozenAt,
  missionFamily, selectedAlternativeId,
  evidenceId, reasoningFrameId,
  userGoalSnapshot, executionContext,
  builderId, allowedCapabilities[],
  expectedAssetTypes[], uiCardFamily, publishPipelineId
}
```

### Alternatives

```typescript
AlternativeMission {
  id, label, missionFamily, score, rationale,
  supportingAssertionRefs[]
}
```

### Living Execution Graph

- **Structure** (nodes, edges, capabilities): immutable after verification.
- **State** (node status, outputs, owner draft): evolves during run.

### Business Asset

Replaces “artifact” in kernel vocabulary. Videos, QR codes, menus, loyalty cards, campaigns, offers, websites — all **assets** stored via Suitcase / store systems.

---

## 8. Four registries + experience/knowledge

| Registry | Role | Called by |
|----------|------|-----------|
| **Perception plugins** | Interpret stream window | Perception stage |
| **Experience providers** | Platform-learned patterns (thresholds, what worked) | Reasoning |
| **Knowledge providers** | Imported domain facts (tax law, POS schemas) | Reasoning |
| **Mission plugins** | Build graph, bind capabilities, publish | Post-contract only |

Runtime dispatches **capabilities** only:

`LoadContext | Analyze | Infer | Ask | Generate | Validate | Persist | Publish`

Implementation: `apps/core/cardbey-core/src/lib/kernel/registries.ts`

---

## 9. Capability runtime rules

1. Runtime **never** asks “is this campaign?” — contract already decided.
2. Runtime **never** calls experience/knowledge plugins.
3. Owner input updates **execution draft** / graph state — not contract family.
4. `needs_input` pauses graph state; resume continues same graph id.

---

## 10. Migration map (from current Cardbey)

| Today | Kernel home | Phase |
|-------|-------------|-------|
| `buildAttachmentAnalysis()` | Perception plugin → stream events | 1 |
| `IntentReasoner` | Reasoning orchestrator input | 2 |
| Intake hijack overrides | Alternatives + Decision clarify | 2–3 |
| `resolveStoreForIntakeTool` | Post-contract execution context | 3 (keep) |
| `loyaltyTopologyBuilder` | Mission plugin → living graph | 4 |
| `topologyNodeRunner` | Capability runtime | 4–5 |
| `attachmentAnalysis.missingFields` | Reasoning + Ask capability | 4 |
| PIL / business memory | Experience providers | 5 |
| Parallel loyalty scan path | Kernel ingress only | 5 |

**Reference plugin:** loyalty (first mission family registered).  
**Second proof case:** menu upload, no prompt → alternatives → clarify.

---

## 11. Phased implementation

| Phase | Deliverable | Production behavior |
|-------|-------------|---------------------|
| **0** | This spec + `lib/kernel/` types, registries, laws | **Unchanged** |
| **1** | `attachmentRealityStreamSidecar` on `buildAttachmentAnalysis` + `ingestAssetForIntentDetection` | **Unchanged** (append-only sidecar; in-memory store) |
| **2** | Passive cognitive pipeline: Perception → Evidence → Reasoning → Alternatives | **Unchanged** (observe, persist, log parity; Performer ignores) |
| **3** | Decision Calibration — DecisionRecord, disagreement classification, readiness gates | **Unchanged** (observe/explain only; Performer decides) |
| **4** | Decision Authority — kernel becomes primary when readiness gates pass | Replace IntentReasoner routing |
| **5** | Campaign plugin + Ask capabilities | Campaign Ask fixed |
| **6** | Publish → stream append; experience providers | Circular kernel |

### Phase 1 sidecar contract

- Hooks: `attachmentAnalysis.js`, `assetIntentIngestService.js` (not Performer routes).
- Events appended: `session_context`, `user_upload`, `ocr_output`, `vision_output`.
- Forbidden in stream payloads: `artifactType`, `documentType`, `missionFamily`, `tool`, `suggestedActions`.
- Stream id resolution: `sessionId` → `missionId` → `fileAssetId` → `entityContextId` → `ingestCorrelationId`.
- Never throws; failures log `[RealityStream]` warning only.

### Phase 2 passive cognitive layer

Observe alongside Performer using the Runtime Authority migration pattern:

```text
Reality Stream → Perception Frame → Evidence View → Reasoning Frame → Alternatives → (ignored by Performer)
```

Deliverables (`lib/kernel/passive/`, `perception/`, `evidence/`, `reasoning/`):

| Output | Immutable | Role |
|--------|-----------|------|
| Perception Frame | Versioned | Entity cues from stream — no mission |
| Evidence View | Frozen at `frozenAt` | Query over stream event/observation ids |
| Reasoning Frame | Versioned | Goals, ambiguity, risks, opportunities |
| Alternatives | Part of reasoning frame | Ranked mission proposals — no execution |

Rules:

- Does **not** replace IntentReasoner or change intake routing.
- Does **not** decide or execute — Decision remains Performer until Phase 3.
- Persists runs in-memory; logs `[KernelCognitive] passive_run`.
- `recordCognitiveParityComparison()` exported for parity measurement (not wired to routes in Phase 2).
- Phase 3 gate: kernel becomes authority only when Performer parity ≥99%.

### Phase 2 parity observe (active)

After Performer classification stabilizes (post-IntentReasoner overrides), intake calls `observeIntakeClassificationParity()` — **passive only**.

Each record includes:

| Field | Purpose |
|-------|---------|
| `intentReasonerTool` | Raw classifier output before attachment hijacks |
| `performerTool` | Final tool Performer routes with |
| `topKernelAlternative` | Kernel rank-1 proposal |
| `agreement` | `top1` \| `top3` \| `disagree` \| `no_kernel_run` |
| `tags` | `attachment_hijack`, `campaign_vs_loyalty`, `performer_override`, `disagreement` |

Metrics: `buildCognitiveParityMetrics({ sinceMs })` → top-1 %, top-3 %, disagreement examples, hijack/conflict cases.

Optional durable log: set `KERNEL_PARITY_LOG_PATH` (JSONL append) for 7–14 day rolling analysis.

Phase 3 gate: ≥99% top-1 agreement **and** all disagreements classified **and** no unexplained disagreements in 14 days — before kernel becomes decision authority.

### Phase 3 decision calibration

```text
Reasoning → Alternatives → DecisionRecord → (Performer still routes)
```

Modules: `lib/kernel/calibration/`

| Output | Role |
|--------|------|
| `DecisionRecord` | Immutable audit — what was considered, selected, rejected, why |
| `classifyDisagreement()` | Heuristic reason codes (never routes) |
| `buildDecisionCalibrationMetrics()` | top-1/top-3 %, reason breakdown, readiness gates |
| `buildCalibrationDashboardData()` | Grouped data for future UI |

Optional durable log: `KERNEL_DECISION_RECORD_LOG_PATH` (JSONL).

Readiness gates (all required; no auto-switch):

1. `top1AgreementPct >= 99`
2. `unexplainedDisagreementCount === 0`
3. No `unknown` disagreementReason in last 14 days

---

## 12. Audit & replay

Every frozen mission records:

```text
streamId, evidenceId, perceptionFrameIds[], reasoningFrameId,
alternativesId, contractId, graphStructureId, assetIds[]
```

Replay for model upgrades:

```text
Same stream window → Perception v2 → Reasoning v2 → compare alternatives
(without mutating original contract or evidence view)
```

---

## 13. Glossary

| Term | Meaning |
|------|---------|
| Reality Stream | Append-only event log of what exists / happened |
| Evidence View | Immutable query selecting stream events for a mission |
| Experience | Platform-learned patterns from aggregated outcomes |
| Knowledge | Imported static domain reference |
| Reasoning | Rank methods, detect ambiguity, estimate confidence |
| Alternatives | Observable ranked mission options |
| Mission Contract | Frozen execution mandate |
| Living Execution Graph | Frozen capability DAG with evolving run state |
| Business Asset | Published deliverable (kernel term for “artifact”) |
| Performer | UI/chat surface — not the authority |

---

## 14. Approval

Changes to Laws 1–2 or the one-spine invariant require explicit architecture review. Plugin registration does not.
