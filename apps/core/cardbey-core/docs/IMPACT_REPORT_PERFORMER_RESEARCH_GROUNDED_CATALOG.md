# Impact Report: Performer research-grounded catalog (Phase 1 + 2A)

**Date:** 2026-07-30  
**Status:** Implemented (Phase 1 + 2A) — awaiting soak / Phase 3 ops  
**Scope of this report:** Phase 1 (intake → research input wiring) + Phase 2A (apply sourced catalog pending review, label AI filler as suggested)  
**Explicitly deferred:** Phase 3 (prod Places key / `ENABLE_STORE_RESEARCH_PIPELINE` soak), Phase 4 (confirm replaces filler + contract freeze polish)

### Env levers (Phase 2A)

| Env | Default | Effect |
|-----|---------|--------|
| `PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW` | unset → **on** when `NODE_ENV !== 'production'`; **off** in production | Stage sourced catalog while owner review pending |
| Set to `1` / `true` | — | Force staging on (incl. production) |
| Set to `0` / `false` | — | Restore prior behavior (pending review → AI filler) |

---

## 1. Problem (observed)

Typical Performer create-store:

1. Intake resolves **name / type / location** (and website **template** ids), then builds `missionRunBody` without `websiteUrl` / `phone` / `email` / OCR text — even when `storeCandidate` or card extraction has them.
2. Research may still call Google Places (if key set) and scrape a Places-discovered website, but often lacks the best URL/contact hints.
3. When research finds real items but `ownerReviewRequired && !ownerConfirmed`, `shouldApplyResearchCatalogToDraft` returns **false**, and `buildCatalogForStoreReactStep` falls through to **AI/template** `buildCatalog` while emitting review UI (`pendingOwnerReview`).

**Result:** Draft looks complete and grounded; catalog is often **not** from fetched business data.

**Sources (this session):**

- `createStoreCheckpointDispatch.js` — `resolveCreateStoreHandoffFields` return shape; `missionRunBody`
- `intakePayloadGuard.js` — `pickStoreCreateForm` drops allowlisted `websiteUrl`
- `createStoreIntakeMetadata.js` — `STORE_CREATE_FORM_ALLOWED_KEYS` includes `websiteUrl` (allowlist ≠ forward)
- `researchCatalogDraft.js` — apply gate vs pending owner review
- `draftStoreService.js` — research try/catch “must never abort”; AI fall-through when pending review
- Prior capability audit in conversation (2026-07-30)

---

## 2. Goal (proposed)

Make real fetched evidence the **default catalog authority** on Performer create-store when research extracts items, while keeping:

- Automation by Default (draft still appears; no hard wall for logo-only / no-match)
- Invisible Assistance (ask last)
- Wrap, don’t rewrite (no new CanonicalUnderstanding SOT; reuse `storeCreationResearch` / `storeResearch`)
- Safe Execution (no auto-publish; publish gate already blocks unconfirmed research)

---

## 3. What could break

| # | Risk | Why | Severity |
|---|------|-----|----------|
| 1 | Draft preview shows **real scraped menus** before owner confirm | Phase 2A writes sourced items into draft while review pending (today AI filler hides them until confirm) | Medium — intentional product change; mitigated by `contentOrigin` + existing publish gate |
| 2 | Wrong Places / website match surfaces as catalog | Better inputs (Phase 1) improve match rate but wrong entity still possible | Medium — keep `ownerReviewRequired` + publish block; UI must show review |
| 3 | Downstream UI assumes all preview items are “final” | Some consumers may not read `contentOrigin` / `needsOwnerReview` | Medium — label in preview meta; minimal dashboard badge if missing |
| 4 | Form / intake payload shape change | Extra keys on form, mission body, draft.input | Low if additive |
| 5 | Tests asserting “pending review ⇒ no research catalog on draft” | `researchCatalogDraft.test.js` and related tests encode current gate | Low — update tests to new contract |
| 6 | Guest / logo-only create | If Phase 1 over-seeds stale website from prior candidate | Low — only forward fields bound to current image/handoff (reuse image-bound / candidate fields already on this request) |
| 7 | Catalog item count / kind consistency | Mixing sourced + suggested fillers may change counts vs pure AI | Low — use existing `markSuggestedCatalogItems` for gaps only |

**Assumption:** `storeResearchPublishGate` (or equivalent) remains enforced on public publish paths so unconfirmed sourced drafts cannot go live without owner confirm. **Not re-audited every publish entrypoint in this report** — Phase 1+2A must include a quick grep of publish callers before merge.

---

## 4. Why (design rationale)

| Constraint | Implication |
|------------|-------------|
| Automation by Default | Must not hard-block create-store when research is empty or logo-only |
| Truth over looking complete | Must not present AI menus as if they came from the business website/Google |
| Existing `contentOrigin: sourced \| suggested` | Prefer labelling over inventing a new provenance system |
| Research must never abort store creation | Keep fail-open on network/errors; change only the **pending-review apply** path |
| Wrap, don’t rewrite | Patch intake handoff + catalog apply helpers; do not replace orchestra |

---

## 5. Impact scope

### Phase 1 — Core (required)

| Area | Files (expected) |
|------|------------------|
| Handoff fields | `src/lib/intake/createStoreCheckpointDispatch.js` |
| Form pick / seed | `src/lib/intake/intakePayloadGuard.js` |
| Mission / draft input | `createStoreCheckpointDispatch.js`, possibly `executeStoreMissionPipelineRun.js`, `structured_store_build.js` (pass-through only) |
| Tests | `createStoreCheckpointDispatch` / `intakePayloadGuard` tests if present |

### Phase 2A — Core (required)

| Area | Files (expected) |
|------|------------------|
| Apply gate | `src/services/draftStore/researchCatalogDraft.js` |
| Catalog step | `src/services/draftStore/draftStoreService.js` (`buildCatalogForStoreReactStep`) |
| Suggested labelling | reuse `src/lib/storeResearch/catalogNormalizers/index.js` → `markSuggestedCatalogItems` |
| Tests | `researchCatalogDraft.test.js`, store-creation research tests |

### Phase 2A — Dashboard (minimal, if needed)

| Area | Files (expected) |
|------|------------------|
| Honesty in preview | `StoreResearchReviewCard` / preview chrome — show sourced vs suggested; only if current UI would still look “fully confirmed” |

### Out of scope (this delivery)

- Enabling `ENABLE_STORE_RESEARCH_PIPELINE` in production (Phase 3 / ops)
- Forcing `GOOGLE_PLACES_API_KEY` in repo (ops)
- Full BUE enablement / CanonicalBusinessUnderstanding SOT
- Changing Discovery import UI
- Auto-publishing research refresh deltas

---

## 6. Smallest safe patch

### Phase 1 — Forward research inputs

1. **`resolveCreateStoreHandoffFields`**  
   Also return (when present on form / params / `storeCandidate` / card extraction for **this** request):
   - `websiteUrl` (normalize via existing `normalizeWebsite` if already used elsewhere)
   - `phone`
   - `email`
   - optional `ocrText` / raw OCR string if already on handoff

2. **`pickStoreCreateForm`**  
   Include `websiteUrl` (and phone/email if already collected by form) so allowlist is not a dead key.

3. **`missionRunBody` + draft.input path**  
   Pass `websiteUrl`, `phone`, `email`, `ocrText` into the body that eventually reaches `resolveStoreResearchInputFields` / `runStoreCreationResearch`.

4. **Do not** invent URLs. Only forward user/OCR/candidate values already on the request.

### Phase 2A — Apply sourced pending review; label filler

1. **New apply semantics** (name illustrative):
   - `shouldApplyResearchCatalogToDraft` today: apply only when not pending review.
   - Add `shouldStageResearchCatalogPendingReview(research)` → true when research ran, has products/extracted items, `ownerReviewRequired`, not confirmed, not `fallbackToGenerated`.

2. **`buildCatalogForStoreReactStep`**:
   - If stage-pending: write **research catalog** into draft (finalize via existing `finalizeResearchCatalogForDraft`), stamp items `contentOrigin: 'sourced'`, `needsOwnerReview: true` (or equivalent existing flags).
   - Still emit `store_research_review_required` / `pendingOwnerReview`.
   - **Do not** call `buildCatalog` (AI) as a full replacement for that catalog.
   - Optional gap fill: only if product policy wants a minimum item count — use `markSuggestedCatalogItems` and never mark those as sourced.

3. **When research empty / `fallbackToGenerated`**: keep current AI/template path, but stamp generated items `contentOrigin: 'suggested'` where cheap (reuse helper).

4. **Publish**: rely on existing `storeResearchPublishGate` (verify callers). No auto-publish.

5. **Tests**:
   - Handoff forwards website/phone from storeCandidate.
   - Pending review + extracted items → draft products are sourced, not AI-only.
   - `fallbackToGenerated` → suggested path still works.
   - Publish remains blocked until confirm (existing gate test extended if needed).

---

## 7. Rollback

| Lever | Action |
|-------|--------|
| Phase 1 | Revert handoff/form/body forwarding (feature flag optional: `PERFORMER_RESEARCH_INPUT_FORWARD=0`) |
| Phase 2A | Restore `shouldApplyResearchCatalogToDraft` behavior (pending review ⇒ no apply ⇒ AI fill). Prefer env `PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW=0` if dual-path needed during soak |

**Recommendation:** ship Phase 1 without flag (additive). Gate Phase 2A with env default **on in non-production**, **off in production until soak** — same pattern as `ENABLE_STORE_RESEARCH_PIPELINE`.

**Assumption:** Product accepts a short soak; if not, default Phase 2A on everywhere and rely on publish gate + review UI.

---

## 8. Success criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | Create-store with OCR/candidate website → research input has `website` | Unit test + debugger snapshot |
| 2 | Research extracts N items + owner review pending → draft catalog has those N as `contentOrigin: 'sourced'` | Unit/integration test |
| 3 | No silent full AI replacement when sourced items exist pending review | Test asserts `fromResearch` / meta, not pure `buildCatalog` |
| 4 | No match / fallback → draft still created; items labelled suggested where stamped | Test |
| 5 | Public publish still blocked while `ownerReviewRequired && !ownerConfirmed` | Existing publish gate test |
| 6 | Logo-only / name-only still creates store (no new hard wall) | Manual / existing create-store tests |

---

## 9. Observed vs assumed vs proposed

| Claim | Label |
|-------|--------|
| Intake omits website/phone from mission run body today | **Observed** |
| Pending review blocks research catalog apply and AI fills | **Observed** |
| `contentOrigin` / `markSuggestedCatalogItems` exist in storeResearch | **Observed** |
| Publish gate blocks unconfirmed research on all publish entrypoints | **Assumed** until Phase 1+2A pre-merge grep |
| Phase 1+2A alone will make most prod create-stores sourced without Places key | **False / not claimed** — Places key still required for name+suburb-only; Phase 3 ops |
| User wants Phase 1+2A implemented after approving this report | **Proposed** — awaiting explicit “proceed” |

---

## 10. Implementation checklist (after approval)

- [x] Confirm publish-gate coverage on create-store publish paths (`publishDraftService.js` → `getStoreResearchPublishBlockReason`)
- [x] Implement Phase 1 wiring + tests
- [x] Implement Phase 2A staging apply + labelling + tests
- [ ] Optional minimal dashboard honesty if preview still reads as “confirmed”
- [x] Do **not** flip prod `ENABLE_STORE_RESEARCH_PIPELINE` in this PR unless ops requests Phase 3

---

## 11. One-line summary

**Forward real contact/URL/OCR into research, and when research has evidence awaiting owner review, stage that sourced catalog on the draft (labelled) instead of silently replacing it with an AI/template menu — without hard-blocking incomplete create-store flows.**
