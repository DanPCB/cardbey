# Loyalty Plugin — L2 Certification Review

**Plugin:** Loyalty  
**Target kernel:** Execution Kernel V1  
**Review date:** 2026-07-09  
**Reviewer:** Engineering qualification (automated) + pending operational signoff  
**Record type:** Formal certification record (not a test summary)

---

## Certification status (summary)

| Qualification | Code | Status |
|---------------|------|--------|
| Engineering Qualification | EQ | **PASS** |
| Operational Qualification | OQ | **PENDING** |
| Recovery Qualification | RQ | **PENDING** |
| Replay Qualification | PQ | **PENDING** |

### Certification decision

**Current:** Engineering Qualification passed — **ready for final certification pending OQ, RQ, and PQ**

**Not yet awarded:**

- L2 Certified
- L2 Certified — Reference Implementation

L2 is a **platform claim**, not a test result. This record will not advance to certified status until all four qualifications pass.

When fully certified, the intended designation is:

```text
Loyalty Plugin
L2 Certified
Reference Implementation
Execution Kernel V1
```

Only one mission plugin should carry **Reference Implementation** status at a time. Future plugins (Campaign, Store, Menu, POS, Commerce) should be built the way Loyalty L2 was built.

---

## 1. Engineering Qualification (EQ)

**Purpose:** Prove the implementation obeys kernel invariants under automated test.

**Status:** PASS  
**Date:** 2026-07-09

### Backend automated tests

**Command:**

```bash
cd apps/core/cardbey-core
npm exec vitest run \
  src/lib/mission/__tests__/dispatchLoyaltyFromIntake.p0.test.js \
  src/lib/mission/__tests__/dispatchLoyaltyFromIntake.proactiveBypass.test.js \
  src/lib/mission/__tests__/loyaltyOwnerInputResumeFlow.test.js \
  src/lib/mission/__tests__/loyaltyTopologyBuilder.test.js \
  src/lib/toolExecutors/loyalty/__tests__/loyaltyCanonicalDraft.test.js \
  src/lib/toolExecutors/loyalty/__tests__/loyaltyInferOwnerInput.test.js \
  src/lib/toolExecutors/loyalty/__tests__/loyaltyProgramDraftArtifactService.test.js \
  src/lib/intake/__tests__/handlePerformerIntake.loyalty.test.js \
  src/lib/intake/__tests__/loyaltyOverCampaign.test.js \
  src/lib/mission/__tests__/artifactAuthority.test.js \
  src/lib/kernel/__tests__/missionContract.test.js \
  src/lib/mission/__tests__/resolveExecutionContext.test.js
```

**Result:** 12 files, **46/46 tests passed**

| Area | Evidence |
|------|----------|
| Loyalty intake → compiler spine | `dispatchLoyaltyFromIntake.p0.test.js`, `handlePerformerIntake.loyalty.test.js` |
| Proactive bypass / spine authority | `dispatchLoyaltyFromIntake.proactiveBypass.test.js` |
| Loyalty vs campaign disambiguation | `loyaltyOverCampaign.test.js` |
| Execution context resolution | `resolveExecutionContext.test.js` |
| Frozen mission contract | `missionContract.test.js` |
| Topology build | `loyaltyTopologyBuilder.test.js` |
| Owner input inference | `loyaltyInferOwnerInput.test.js` |
| Owner input resume | `loyaltyOwnerInputResumeFlow.test.js` |
| Artifact authority | `artifactAuthority.test.js` |
| Loyalty draft artifact | `loyaltyProgramDraftArtifactService.test.js`, `loyaltyCanonicalDraft.test.js` |

### Dashboard automated tests

**Command:**

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npm test -- run \
  src/lib/loyalty/loyaltyCardScan.test.ts \
  src/lib/multiAgent/topologyReviewModel.test.ts \
  src/components/console/cards/OwnerInputCard.test.tsx
```

**Result:** 3 files, **19/19 tests passed**

| Area | Evidence |
|------|----------|
| Card scan handoff | `loyaltyCardScan.test.ts` |
| Topology review / awaiting_owner_input | `topologyReviewModel.test.ts` |
| Owner input UI | `OwnerInputCard.test.tsx` |

### Architecture invariants (EQ)

| Invariant | Result | Notes |
|-----------|--------|-------|
| No kernel exceptions required for Loyalty | PASS | No loyalty-specific kernel edits surfaced in EQ pack |
| Single execution spine | PASS | Compiler topology spine asserted in loyalty dispatch tests |
| Frozen mission contract | PASS | `missionContract.test.js` + compile handoff tests |
| Canonical runtime states | PASS | Owner-input and topology review paths covered |
| Artifact completion authority | PASS | `artifactAuthority.test.js` + draft artifact service tests |
| Plugin-specific logic in kernel intake router | PASS | No new `if (loyalty)` exceptions required in EQ scope |

**EQ conclusion:** Implementation is qualified for operational certification. EQ proves the engineering; it does not certify the platform.

---

## 2. Operational Qualification (OQ)

**Purpose:** One complete customer journey — nothing skipped, nothing mocked.

**Status:** PENDING

### Required journey

```text
Upload loyalty card
      ↓
Evidence
      ↓
Execution Context
      ↓
Mission Contract
      ↓
Topology
      ↓
Approval
      ↓
Owner Input
      ↓
Resume
      ↓
Artifact
      ↓
Suitcase
      ↓
Publish
```

### OQ checklist

| Step | Observed | Pass |
|------|----------|------|
| Upload loyalty card (image) | | ☐ |
| Evidence barrier completes before classification | | ☐ |
| Store / execution context resolves once | | ☐ |
| Mission contract frozen after compile | | ☐ |
| Topology review shown (`show_execution_plan`) | | ☐ |
| Approval gate works | | ☐ |
| Owner input pause (`awaiting_owner_input`) | | ☐ |
| Resume after owner input | | ☐ |
| Loyalty artifact complete and usable | | ☐ |
| Artifact visible in Suitcase | | ☐ |
| Publish flow succeeds | | ☐ |

**OQ signoff:** `_________________` **Date:** `_________________`

### OQ defect log

| ID | Title | Status | Impact |
|----|-------|--------|--------|
| OQ-002 | Store identity drift after owner-input resume | **Fixed — pending rerun** | Plugin boundary bug, not kernel failure |

#### OQ-002: Store identity drift after owner-input resume

**Symptom:** After owner-input resume, loyalty draft/artifact persisted under stale ambient `context.storeId` (`My Cafe`) instead of topology-resolved `storeContext.storeId` (`abc`).

**Root cause:** `loyalty.persist_draft` and `loyalty.present_review` resolved store identity with ambient `context.storeId` ahead of topology `storeContext.storeId`.

**Fix (plugin boundary):** `resolveLoyaltyTopologyStoreId` enforces priority:

1. `priors.storeContext.storeId`
2. `missionContract.executionContext.storeId`
3. `rawDraft.storeId`
4. `input.storeId`
5. `context.storeId` (fallback only)

Diagnostic when topology store wins over stale ambient context:

```text
[loyalty.store_resolution] stale context.storeId ignored
```

**Regression test:** `src/lib/toolExecutors/loyalty/__tests__/loyaltyStoreResolution.test.js`

**Rerun required:** Full OQ golden path after deploy.

---

## 3. Recovery Qualification (RQ)

**Purpose:** Prove the platform survives interruption — a real operating system requirement.

**Status:** PENDING

### Required scenarios

| Scenario | Steps | Pass |
|----------|-------|------|
| Browser refresh | Upload → refresh → resume | ☐ |
| Server restart | Approve → restart server → resume | ☐ |
| Network disconnect | Owner input → disconnect → resume | ☐ |
| Artifact failure | Generation failure → recover without false completion | ☐ |

### RQ rules

- Mission must not restart from scratch unless contractually required.
- Canonical runtime state must be preserved or correctly rehydrated.
- No duplicate spine execution after recovery.
- No false `completed` without artifact authority.

**RQ signoff:** `_________________` **Date:** `_________________`

---

## 4. Replay Qualification (PQ)

**Purpose:** Prove Cardbey can rebuild execution from immutable sources without re-asking the user.

**Status:** PENDING

### Replay sources

```text
Reality Stream
      +
Mission Contract (frozen)
      ↓
Reconstruct mission state
```

### PQ checklist

| Requirement | Pass |
|-------------|------|
| Reality Stream events exist for upload and key transitions | ☐ |
| Evidence view / evidenceId linked to mission contract | ☐ |
| Mission contract frozen and readable after refresh | ☐ |
| Execution graph / topology recoverable from persisted metadata | ☐ |
| Runtime state derivable without user re-entry | ☐ |
| Artifact lineage traceable to mission completion | ☐ |

**PQ signoff:** `_________________` **Date:** `_________________`

---

## 5. Constitutional Compliance

**Purpose:** Make the three constitutions operational, not theoretical.

| Constitution | Question | Answer |
|--------------|----------|--------|
| **Platform Constitution** | Did Loyalty violate platform philosophy? | **No** — loyalty executes as a plugin on the kernel, not as intake-router branching |
| **Cognitive Constitution** | Did it bypass cognition / evidence? | **No** — EQ pack covers loyalty routing with evidence and reasoning paths; OQ must confirm live upload barrier |
| **Execution Constitution** | Did it require kernel exceptions? | **No** — no loyalty-specific kernel exceptions surfaced in EQ |
| **Plugin Rule** | Was the kernel modified specifically for Loyalty? | **No** — loyalty uses registered spine, contract, topology, and artifact paths |
| **Reference implementation candidate?** | Should Loyalty become the example plugin? | **Yes** — if OQ, RQ, and PQ pass |

### Constitution Review reference

Kernel-touching PRs during this certification period must comply with [`CONSTITUTION_REVIEW.md`](../CONSTITUTION_REVIEW.md).

---

## 6. Certification decision matrix

| Decision | When awarded |
|----------|--------------|
| **Not Certified** | EQ fails or constitutional violation |
| **Provisionally Certified** | EQ pass only (current state) |
| **L2 Certified** | EQ + OQ + RQ + PQ all pass |
| **L2 Certified — Reference Implementation** | L2 Certified + designated as the single reference plugin for Execution Kernel V1 |

### Current decision

**Provisionally Certified (EQ pass)**

Pending:

- OQ — full manual golden path
- RQ — interruption and recovery scenarios
- PQ — replay from Reality Stream + Mission Contract

### Path to Reference Implementation

```text
EQ  PASS   ✓
      ↓
OQ  PASS   ☐
      ↓
RQ  PASS   ☐
      ↓
PQ  PASS   ☐
      ↓
L2 Certified — Reference Implementation
```

### What success proves next

If **Campaign** reaches L2 **without new kernel work**, that proves Execution Kernel V1 is general — not loyalty-specific. That is the moment Execution Kernel V1 is truly successful.

---

## 7. Signatures

| Role | Name | Date | Decision |
|------|------|------|----------|
| Engineering Qualification | Automated test run | 2026-07-09 | EQ PASS |
| Operational Qualification | | | PENDING |
| Recovery Qualification | | | PENDING |
| Replay Qualification | | | PENDING |
| Final certification authority | | | Provisionally Certified |

---

## Related documents

| Document | Path |
|----------|------|
| Mission Plugin Status | [`docs/MISSION_PLUGIN_STATUS.md`](../MISSION_PLUGIN_STATUS.md) |
| Execution Constitution | [`docs/EXECUTION_KERNEL_V1_CERTIFICATION.md`](../EXECUTION_KERNEL_V1_CERTIFICATION.md) |
| Constitution Review | [`docs/CONSTITUTION_REVIEW.md`](../CONSTITUTION_REVIEW.md) |
| Platform Constitution | [`docs/PLATFORM_CONSTITUTION.md`](../PLATFORM_CONSTITUTION.md) |
