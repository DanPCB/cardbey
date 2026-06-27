# Impact Report: Remove Hardcoded Bypasses → Unified Reasoning Path

**Date:** 2026-06-26  
**Requested change:** Delete legacy classifier, remove all intake bypasses, force every input through `IntentReasoner` only.  
**Verdict:** **Do not execute wholesale removal yet** — would break the majority of production Performer flows.

---

## 1. What could break

| Area | Risk if removed now |
|------|---------------------|
| **intakeClassifier.js** (~750 lines) | Loyalty, promotion graphic, poster, document ingest, asset intent detection, store fast-path, campaign orchestration, LLM fallback — **all stop working** |
| **Intake V2 pre-classify shortcuts** | `create_store` from forms/frontscreen, device intents, poster mutate, slideshow, create_card — **immediate 4xx or wrong tool** |
| **Reasoner error fallback** | Any reasoner timeout/exception → unhandled 500 or empty clarify |
| **Attachment ingest bypass** (recent fix) | Business-card uploads regress to `upload_store_asset` + catalog plan |
| **reactPlanner post-classify** | Missing-parameter flows lose structured ask/confirm |
| **Frontend quick actions** | Pills that use `unifiedDispatch` directly never reach reasoning |
| **edit_website frontend bypass** | Website edit sessions break (skips intake entirely) |
| **Kernel mandatory + shortcut policy** | Create-store runway conflicts with "no shortcuts" rule |

## 2. Why

- `IntentReasoner._inferGoal` pattern-matches **~8 intent families**; `intentTypes.ts` defines **40+**.
- Legacy classifier has **15+ deterministic fast-paths** plus LLM with a 300-line tool prompt.
- Planner template tools (`validate_store_context`, `upload_catalog`, etc.) are **not executable** — reasoning-only path still cannot execute many plans.
- `ingest_asset_for_intent_detection` is the **correct** read→explain→ask flow for uploads; it is implemented outside the reasoner by design.

## 3. Impact scope

- **Performer Intake V2** (all console chat)
- **Quick action pills** (dashboard)
- **Guest flows** (sign-in gates, draft store)
- **Store/campaign creation runway**
- **Document/card upload flows**
- **Tests:** 50+ classifier/integration tests fail on delete

## 4. Smallest safe path (recommended)

Phased unification — **absorb** legacy capability into reasoner, then **delete** bypasses one layer at a time:

### Phase A — Make reasoning the single classifier (keep internal fast-paths)
1. `performerIntakeV2Routes.js`: Always call `intentIntegration.processIntake()` (remove `if (!isEnabled) classifyIntent` branch).
2. `intentIntegration.js`: **Remove** `_fallbackToLegacy(classifyOpts)` on error → return structured clarify + telemetry (or retry reasoner once).
3. Move `classifyIntent` fast-path functions **into** `IntentReasoner` as pre-LLM rules (not a second pipeline).
4. Keep `ingest_asset_for_intent_detection` as the reasoner's **execute** step for `analyze_asset` intent (not a bypass).

### Phase B — Collapse pre-classify route shortcuts into reasoner context
1. Pass `storeCreateForm`, `primaryMode`, `intentSource` into reasoner context (already partially done).
2. Remove early `return` blocks in intake routes only **after** reasoner handles equivalent cases.
3. Deprecate `reactPlanner` when reasoner handles missing-params.

### Phase C — Execution honesty
1. Remove phantom planner template tools or map to real registry tools.
2. Route quick actions through intake v2 with `forceIntent` metadata, not direct `unifiedDispatch` where possible.

### Phase D — Flags
1. Default `ENABLE_INTENT_REASONER=true` only after Phase A parity tests pass.
2. Remove rollout % once stable.

**Do not delete `intakeClassifier.js` until Phase A ports all fast-paths.**

---

## 5. Contradiction with recent work

Session fix (2026-06-26): `intentIntegration.processIntake` **bypasses reasoner** for attachment-only uploads → `classifyIntent` → `ingest_asset_for_intent_detection`.

Under strict "no bypass" rule, the correct fix is:
- Reasoner infers `analyze_asset` for all attachment-only inputs
- `_determineAction` sets `tool: ingest_asset_for_intent_detection`
- **Not** calling legacy `classifyIntent` from integration layer

---

## 6. Sign-off required before

- [ ] Delete `intakeClassifier.js`
- [ ] Remove `ENABLE_INTENT_REASONER` flag
- [ ] Remove intake route shortcuts (section 1 of performerIntakeV2Routes)
- [ ] Remove reasoner→legacy attachment bypass
