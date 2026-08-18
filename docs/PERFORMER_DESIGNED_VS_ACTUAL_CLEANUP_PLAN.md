# Performer: Designed vs Actual — Gap Report & Cleanup Plan

**Date:** 2026-08-12  
**Audience:** Product + engineering  
**Worktree:** `C:\Projects\cardbey-wt-store-gen-p2` (canonical for this plan; PRs → `staging`)  
**Verdict:** Performer is a **capable dispatch/runway starter** with **partial grounded store generation**. It is **not** yet an evidence-bound operator that reliably reads, understands, reasons, and acts as one mind.

Related canvas: `performer-gap-cleanup-plan.canvas.tsx` (Cursor canvases).

---

## 1. What the system is designed to perform

Cardbey Performer is the **primary operator surface**: turn user intent + evidence into correct, governable work.

| Capability | Designed behavior |
|------------|-------------------|
| **Read** | Text, card, menu, logo, file become **binding** evidence |
| **Understand** | One turn belief: identity, offerings, gaps, conflicts, confidence |
| **Reason** | Choose next step from belief; explain in plain language |
| **Act** | Dispatch the right runway with reconciled inputs |
| **Govern** | Observe → Infer → Suggest → **Confirm** → Execute for high-impact work |
| **Status** | Single coherent state visible in chat, inspector, and steps |
| **Truth** | Sparse grounded facts preferred over invented completeness |

Create-store is a **runway** under Performer—not a second brain. PIL and safe-execution governance forbid silent publish/pay/message/claim.

Architecture intent (from `docs/system_architecture.md`): Console → governed intent → Intake V2 → reason → runtime kernel → tools → mission/SSE. In practice, **IntentReasoner (deterministic) is always-on**; **LLMReasoner and Mission Orchestrator are freezing/partial**—i.e. designed as an agent stack, shipped largely as a **router**.

---

## 2. Current malfunctions (observed)

| # | Designed | Current malfunction | Evidence |
|---|----------|---------------------|----------|
| M1 | Bind attachment to identity | Mission title (“NOODLE”) proceeds despite coffee logo / wrong card / unrelated flyer | Runtime screenshots 2026-08-12 |
| M2 | One understanding | No single TurnBelief; chat, research, draft, inspector disagree | Parallel context keys + contradictory UI |
| M3 | Honest reasoning copy | Stock “need more detail” + celebratory “kicked off” in same flow | `needMoreDetail` catalog + progress templates |
| M4 | One status | Clarify / working / needs approval / kicked off overlap | Mission console screenshots |
| M5 | Act only when evidence allows | Create-store dispatch starts without reconciled multimodal belief | Goal-driven runway |
| M6 | Meaningful execution replay | Repeated `tool.dispatch.started` without user-meaningful completion story | Inspector execution history |
| M7 | Truthful catalog | Historically invented Edamame / hours-as-SKU / Other copy; Pass 1/2 closing **catalog** gaps only | Runtime proof + Pass 2 draft empty menu |
| M8 | Preview matches belief | Generic hero (“Casual Food Cafeteria”) while identity/evidence incomplete | Preview pane |

**Important:** Latest grounded draft can show **empty menu + “food business” slogan** (Pass 2 working on catalog). That does **not** fix M1–M6.

---

## 3. Gaps that must be fixed

### G1 — Missing product contract
“Performer works” was never locked to: *correct belief + consistent action + honest status*. Metrics drifted to pipeline completion and local tests.

### G2 — Missing TurnBelief authority
No immutable-per-turn object that chat, clarify, dispatch, preview, and replay all read. Every layer invents its own story.

### G3 — Evidence not binding
Uploads are often optional sidecars to a titled mission, not the source of truth that can **block** or **rebind** create-store.

### G4 — Status fan-out
Multiple projectors (intake messages, runtime state, mission steps, approval checkpoints) without a single enum.

### G5 — Conflicting design goals in one UX
Automate vs confirm; celebrate vs wait; invent completeness vs grounded sparseness—implemented simultaneously.

### G6 — Dirty accumulation
Message catalogs, chip menus-as-cognition, parallel planners (some frozen), invent/repair re-entry paths, flag soup. Each “fix” added surface area.

### G7 — Wrong finish line for agency
Unit/pipeline green ≠ “user can trust what the agent said about the upload.”

---

## 4. Comprehensive cleanup plan

**Principle:** Stop patching layers. Install **one spine**, then delete everything that competes with it.

### Phase 0 — Contract lock (1 short cycle) — **DELIVERED (awaiting ACK)**

Deliverables:

1. **Performer Capability Contract** — `docs/PERFORMER_CAPABILITY_CONTRACT.md` (`performer.capability.contract.v1`)
2. **TurnBelief schema** — `apps/core/cardbey-core/src/lib/performerTurnBelief/turnBelief.js`
3. **Status enum** — `PERFORMER_STATUS` in `performerStatus.js`
4. **Freeze** — `.cursor/rules/performer-p0-contract-freeze.mdc`

Exit: **COMPLETE** — owner ACK `ACK PERFORMER_CAPABILITY_CONTRACT_V1` on 2026-08-12.

Impact: `docs/IMPACT_REPORT_PERFORMER_P0_CONTRACT_LOCK.md`

### Phase 1 — TurnBelief spine (core) — **PARTIAL (dispatch gate landed)**

Landed:

1. `buildTurnBeliefFromIntake` — goal vs OCR/attachment identity + hours as non-offering facts
2. Create-store choke point in `dispatchCreateStoreCheckpointPipeline` → `turn_belief_blocked` clarify (no deferred invent kickoff)
3. Conflict resolve chips: `use_goal` / `use_evidence`
4. Celebratory explainer gated by `allowsCelebratoryCopy`
5. Unit tests: coffee vs NOODLE → BLOCKED

Still open for P1 completion / P2:

- Persist TurnBelief on every mission context + inspector status projector
- Upload-ask path always builds belief before chips
- Full E2E runtime proof with wrong-logo mission

### Phase 2 — Status unification

1. One **status projector** feeds chat, inspector, step counts, approval UI.
2. Ban dual messaging in one turn (clarify + kicked-off).
3. Replay = belief transitions + tool outcomes (not raw dispatch spam).

Exit: Screenshot matrix: same status string in all three surfaces for 5 scenarios.

### Phase 3 — Clean store runway (keep Pass 2, finish binding)

1. Grounded generation policy remains; TurnBelief supplies offerings/hours/identity.
2. Preview DTO must expose authority trace + match belief.
3. Hero/media cannot claim “Casual Food Cafeteria” identity without evidence.

Exit: Hours-only card → empty menu + hours field; menu photo → extracted items or incomplete; never cuisine bank.

### Phase 4 — Delete dirty work

Quarantine or remove:

| Dirty asset | Action |
|-------------|--------|
| Celebrate-on-dispatch templates that ignore belief | Delete or gate behind DONE |
| Clarify chips that replace understanding | Demote to belief-driven options only |
| Frozen LLMReasoner / unused orchestrators not feeding TurnBelief | Remove from default path or delete |
| Duplicate invent/repair writers under GROUNDED | Already constrained; audit remaining |
| Layer-local “success” SSE that contradicts status enum | Route through projector |

Exit: Dependency graph shows one execute path; dead planners not importable from intake.

### Phase 5 — Proof bar (no more theater)

Mandatory E2E suite:

1. Wrong card vs goal → BLOCKED  
2. Menu image → offerings or incomplete  
3. Hours-only → no SKU invent  
4. Status coherence across UI  
5. High-impact confirm never autoSubmit  
6. User-visible sentence matches draft metadata  

**Do not** declare clean from unit tests or empty-menu alone.

---

## 5. What to keep (not dirty)

- Safe-execution / PIL confirm model  
- Intake V2 as API entry (if it becomes a writer to TurnBelief)  
- Grounded store-creation policy (Pass 1/2 direction)  
- Mission as durable work container (status must project from belief + runtime)  
- Canonical create-store runway (no second generator)

---

## 6. Sequencing rule

```text
Contract → TurnBelief → Status → Runway binding → Delete competitors → E2E proof
```

Any catalog/media patch that does not consume TurnBelief is **out of order** unless it closes a proven G-class invent path under grounded mode.

---

## 7. Success definition (clean)

Performer is clean when:

1. Evidence is binding.  
2. One belief, one status, one dispatch gate.  
3. Conflicts stop the runway.  
4. Chat sentence matches draft.  
5. High-impact stays confirm-gated.  
6. Dirty parallel cognition paths are gone from the default path.

Until then, call it what it is: **dispatch + partial grounding**, not a finished Performer.
