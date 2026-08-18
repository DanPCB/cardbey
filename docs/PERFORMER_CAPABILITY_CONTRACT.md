# Performer Capability Contract (P0 — LOCKED DRAFT)

**Status:** `OWNER_ACKNOWLEDGED`  
**Date:** 2026-08-12  
**Version:** `performer.capability.contract.v1`  
**Scope:** Cardbey Performer (console + intake + runtime + create-store runway under Performer)

**Owner ACK:** `ACK PERFORMER_CAPABILITY_CONTRACT_V1` recorded **2026-08-12** (local).  
P0 exit complete. Phase 1 (TurnBelief spine) is authorized to proceed.

This contract is the **finish line** for “Performer works.”  
Pipeline completion, unit greens, or celebratory chat copy are **not** success criteria unless they satisfy this contract.

---

## 1. Role

Performer is the **evidence-bound operator**:

> Read evidence → form one TurnBelief → reconcile with goal → one status → propose/act only when allowed → confirm before high-impact → prefer truthful incomplete over invented complete.

Create-store / campaign / catalog tools are **runways under Performer**, not second brains.

---

## 2. Must (required behaviors)

| ID | Must |
|----|------|
| M-01 | Form a **TurnBelief** for every user turn that can change work (text and/or attachment). |
| M-02 | Treat attachments as **binding evidence** when present (not optional decoration of the mission title). |
| M-03 | Expose **one status** from `PERFORMER_STATUS` to chat, inspector, and step UI. |
| M-04 | Speak from belief: user can quote one sentence that matches draft/mission truth. |
| M-05 | On **hard identity conflict** (goal vs evidence), set status `BLOCKED` and **do not** invent a store catalog to paper over it. |
| M-06 | Prefer **empty/incomplete grounded output** over cuisine/category invention when evidence does not support offerings. |
| M-07 | High-impact actions require **explicit user confirmation** (`autoSubmit: false`). |
| M-08 | Dispatch/tools receive TurnBelief snapshot (or equivalent id); refuse when status forbids execution. |
| M-09 | Grounded store creation (`ENABLE_GROUNDED_STORE_CREATION_V1`) obeys generation grounding policy end-to-end (no QA invent re-entry). |
| M-10 | Authority/traceability for factual claims is available on grounded drafts (or documented incomplete). |

---

## 3. Must not

| ID | Must not |
|----|----------|
| N-01 | Celebrate “kicked off / automated setup” while status is `NEEDS_EVIDENCE`, `BLOCKED`, or `AWAITING_CONFIRM` for the same turn. |
| N-02 | Use clarify chips as a substitute for understanding (chips may only offer belief-driven options). |
| N-03 | Let mission **title alone** override conflicting attachment identity without user resolution. |
| N-04 | Invent customer-facing catalog facts under grounded mode without accepted offering evidence. |
| N-05 | Launder generated content as `VERIFIED` / `grounded_evidence`. |
| N-06 | Show customer-facing “Other” taxonomy leaks (`quality Other`, `local Other`). |
| N-07 | Add a new parallel reasoner/orchestrator/generator that bypasses TurnBelief. |
| N-08 | Declare Performer “fixed” from unit tests or empty-menu alone without contract E2E proof. |
| N-09 | Silently publish, pay, message customers, claim ownership, delete business data, or push live signage. |

---

## 4. High-impact actions (confirmation required)

Aligns with safe-execution governance + PIL. Confirmation required before execute:

| Domain | Examples (`proposedAction` keys — illustrative) |
|--------|--------------------------------------------------|
| Publish / live pages | `publish_store`, `publish_campaign`, go-live preview → public |
| Campaigns / offers | `create_campaign`, `launch_campaign`, `claim_offer` (customer-facing) |
| Customer messaging | SMS/email/push/social send |
| Payments / billing | charge, subscribe, payout |
| Bookings | create/cancel booking that notifies customer |
| Device signage | push playlist / live screen content |
| Data deletion | delete store, purge catalog, destroy mission artifacts |
| External publishing | post to Facebook/TikTok/etc. |
| Ownership / claims | claim business, transfer ownership |

**Allowed without confirmation:** analysis, drafts, previews, recommendations, internal enrichment, read-only navigation, preparing missions with `autoSubmit: false`.

---

## 5. Status enum (canonical)

See code: `apps/core/cardbey-core/src/lib/performerTurnBelief/performerStatus.js`

| Status | Meaning | User-facing intent |
|--------|---------|-------------------|
| `NEEDS_EVIDENCE` | Missing inputs to form adequate belief | Ask for specific evidence |
| `READY_TO_PROPOSE` | Belief enough to propose a plan (not yet running) | Show proposal / next step |
| `AWAITING_CONFIRM` | High-impact or policy gate waiting on user | Confirm / reject |
| `RUNNING` | Authorized work in progress | Progress only — no fake completion |
| `BLOCKED` | Conflict or policy stop | Explain blocker; no invent |
| `DONE` | Turn/mission goal completed under contract | Celebrate only here |
| `FAILED` | Execution failed after start | Error + recovery |

**Rule:** Chat + inspector + steps must project the **same** status value for a given mission/turn.

---

## 6. TurnBelief (canonical)

See code: `apps/core/cardbey-core/src/lib/performerTurnBelief/turnBelief.js`

Minimum fields:

- `turnBeliefId`, `missionId`, `createdAt`, `updatedAt`
- `goal` (user/mission goal text)
- `status` (`PERFORMER_STATUS`)
- `identity` (name, category, location, confidence, evidenceRefs)
- `offerings[]` (authoritative only)
- `nonOfferingFacts[]` (hours, contact, location spans — never catalog SKUs)
- `evidenceRefs[]`
- `conflicts[]`
- `gaps[]` / `missingQuestions[]`
- `confidence` (0–1)
- `proposedAction` / `confirmationState`
- `userVisibleSummary` (one sentence)

**Authority:** Chat copy, dispatch gate, and preview identity claims must read TurnBelief (P1+). P0 locks the schema only.

---

## 7. Success metrics (contract E2E)

| Scenario | Pass |
|----------|------|
| Coffee logo + goal “NOODLE” | `BLOCKED` + conflict; no invented NOODLE menu |
| Hours-only card | Hours as hours; menu empty/incomplete |
| Real menu photo | Offerings from evidence or incomplete; no cuisine bank |
| Status surfaces | Same enum in chat, inspector, steps |
| High-impact | Confirm checkpoint; never silent |
| Quote test | Agent sentence matches draft/meta |

---

## 8. Freeze (P0 → until P1 spine lands)

Until TurnBelief is wired (Phase 1):

1. **No** new celebratory intake templates that fire on dispatch start.
2. **No** new parallel reasoners / orchestrators / store generators.
3. **No** new invent writers outside grounded generation policy.
4. Catalog grounding fixes must consume shared grounding policy — not new ad-hoc invent paths.
5. Status strings in new UI must use `PERFORMER_STATUS` constants (no new synonyms).

Cursor rule: `.cursor/rules/performer-p0-contract-freeze.mdc`

---

## 9. Owner acknowledgment

P0 exits only when the owner replies with explicit acknowledgment, e.g.:

```text
ACK PERFORMER_CAPABILITY_CONTRACT_V1
```

Until ACK: treat this document as the working contract for engineering; do not start Phase 1 wiring without ACK if product wants to amend must/must-not lists first.

| Field | Value |
|-------|--------|
| Contract id | `performer.capability.contract.v1` |
| Owner ACK | `ACK PERFORMER_CAPABILITY_CONTRACT_V1` |
| ACK date | 2026-08-12 |
