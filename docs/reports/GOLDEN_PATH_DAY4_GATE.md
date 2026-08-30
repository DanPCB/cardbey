# Golden Path Day 4 Gate — Result-First Reveal

**Gate ID:** `CARDBEY_V1_GOLDEN_PATH_DAY4_RESULT_FIRST_REVEAL`  
**Date:** 2026-08-30

## Verdict

**CARDBEY_V1_GOLDEN_PATH_DAY4_PARTIAL** — implementation complete; **live staging proof pending** dashboard deploy with Day 4 bundle.

---

## Architectural finding (live evidence)

### Observation

Modern Security Doors on staging (2026-08-30) demonstrated:

| Layer | State |
|-------|--------|
| **RESULT** | Present — Performer right panel rendered full website preview (hero, identity, location, contact) |
| **MISSION** | Completed build (`structured_store_build`) with brand-assets checkpoint pending |
| **EDIT SESSION** | **Failed** when navigating to `/app/store/draft/review?...` — "We couldn't reopen the exact store editing session" |

### Conclusion

```
RESULT AVAILABILITY ≠ EDIT SESSION AVAILABILITY
```

**Day 4 principle (locked):**

| Concept | Role in V1 |
|---------|------------|
| **RESULT** | Primary — persistent business Cardbey created (`draftId` → `/preview/website/:draftId`) |
| **EDIT SESSION** | Secondary — only when user explicitly chooses to edit |
| **MISSION** | Background — mostly invisible during Golden Path |

> Never make persistent product visibility depend on temporary interaction state.

---

## Implementation (dashboard)

### 1. Result-first auto-reveal

| Module | Behavior |
|--------|----------|
| `assessStoreResultReadiness.ts` | Draft `ready` / `storeDraftReviewReady`; checkpoint is **warning only** |
| `storeResultReveal.ts` | On readiness → navigate to **`/preview/website/:draftId`** (never auto-route to edit-session review) |
| `storeDraftPreviewCommit.ts` | Triggers reveal when inline preview commits |
| `usePerformerConsole.ts` | Wires reveal on pipeline hydration + terminal completion |

**Success moment:** toast `"Your business is ready."` then full website preview.

### 2. Canonical result surface

| Surface | Route | Use |
|---------|-------|-----|
| **Primary (Golden Path)** | `/preview/website/:draftId?generationRunId=…` | Direct draft render; refresh-safe; no session restore |
| Inline Performer panel | Same data via `buildWebsitePreviewInlineUrl` | Build-time preview only |
| Edit-session review | `/app/store/draft/review?…` | **Explicit edit only** — not success destination |

### 3. Customer-facing progress (non-debug)

| Module | Behavior |
|--------|----------|
| `storeCreationPromoStream.ts` | Replaces raw blackboard process lines with single promo phase label |
| `conversationRuntimeUx.ts` | Tool → promo label mapping |
| `missionStreamComposer.ts` | Applies filter for store-creation missions |
| `isPerformerRuntimeDebugMode()` | Full `web_scrape_*`, `react_step_*`, `Step N (tool)` trace when `cardbey.performerRuntimeDebug=true` |

**Promo labels (only):**

1. Understanding your business  
2. Finding your products & services  
3. Learning your brand  
4. Preparing your Cardbey presence  

### 4. Edit failure isolation

| File | Change |
|------|--------|
| `StoreReviewPage.tsx` | Recovery UI offers **Open website preview** + **Back to Mission Process** (not `/app/console`); result remains at preview URL |

---

## Files changed

- `src/lib/storeLaunch/storeResultReveal.ts`
- `src/lib/storeLaunch/storeCreationPromoStream.ts` (new)
- `src/lib/storeLaunch/storeCreationPromoStream.test.ts` (new)
- `src/lib/storeLaunch/storeResultReveal.test.ts`
- `src/app/console/performer/missionStreamComposer.ts`
- `src/pages/store/StoreReviewPage.tsx` (recovery — prior commit `b4912537`)

---

## Live acceptance test — Modern Security Doors

**Input:** `modernsecuritydoors.com.au`

| Step | Expected | Live (pre-Day-4 deploy) |
|------|----------|---------------------------|
| Create Your Business → Performer intake | PASS | PASS |
| Real research/build | PASS | PASS (MSD grounded preview) |
| Human-readable progress only | PASS after deploy | FAIL (internal lines visible) |
| Draft ready → **automatic** full preview | PASS after deploy | PARTIAL (manual / edit route) |
| No restore screen on success path | PASS after deploy | FAIL if user hits review URL |
| Refresh `/preview/website/:draftId` | PASS | PENDING |
| Performer FAB remains for correction | PASS | PASS |

---

## Verification commands

```bash
# Local unit tests
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run src/lib/storeLaunch/

# Staging (after deploy)
node scripts/golden-path-day4-staging-verify.mjs
node scripts/golden-path-day4-staging-verify.mjs --full
node scripts/v1-promo-capture-check.mjs --full
```

---

## Promo capture impact

After Day 4 deploy, continuous story becomes recordable:

```
Create Your Business → modernsecuritydoors.com.au
→ Understanding… → Finding… → Learning… → Preparing…
→ MODERN SECURITY DOORS full preview (auto)
```

No mission screen, no restore screen, no manual "Open website preview" click.

---

## Out of scope (Day 5+)

- Publish / Share / Improve with AI CTAs on result page  
- New post-create action architecture  
- Repairing edit-session restoration as primary path  

---

## Related gates

- Day 1: `GOLDEN_PATH_DAY1_GATE.md` — research pipeline  
- Day 2: `GOLDEN_PATH_DAY2_GATE.md` — entry convergence  
- Day 3: `GOLDEN_PATH_DAY3_GATE.md` — intelligence-first intake  
- Promo: `V1_PROMO_CAPTURE_AUDIT.md`, `V1_PROMO_SHOT_LIST.md`

---

## Final gate status

| Check | Status |
|-------|--------|
| Result-first route (`/preview/website/:draftId`) | **IMPLEMENTED** |
| Edit-session decoupled from success | **IMPLEMENTED** |
| Customer progress UX | **IMPLEMENTED** |
| Debug trace preserved | **YES** |
| Live staging proof | **PENDING deploy** |

---

## RESULT SURFACE UX COMPLETION

**Gate ID:** `CARDBEY_V1_GOLDEN_PATH_DAY4_RESULT_SURFACE_UX_READY`  
**Date:** 2026-08-30

### Blackboard lifecycle

| Phase | Behavior |
|-------|----------|
| **Processing** | Blackboard expanded; single human-readable promo phase label (non-debug) |
| **Result ready** | Auto-collapse to compact summary (`✓ Your business is ready` + completed bullets) |
| **User opens details** | Expandable panel shows preserved human-readable build history |
| **User closes details** | Collapse again; manual expand is respected (no immediate re-collapse) |

**Source of truth for collapse:** usable business result exists (`inlineWebsitePreview` draft ready / `assessStoreResultReadiness`), not mission terminal alone.

### Compact state

- `PerformerBuildHistoryCollapsible` — summary bullets mapped from real `STORE_CREATION_PROMO_PHASES`
- Raw `react_step_*`, `web_scrape_*`, pipeline object names hidden unless `cardbey.performerRuntimeDebug=true`

### Preview owner menu

- `DraftPreviewOwnerChrome` on `/preview/website/:draftId` — Back, Draft Preview title, Build details, More menu, Publish (existing flow)
- `DraftPreviewBuildDetailsPanel` — drawer/sheet reusing `useMissionBlackboardRows` (no new storage model)
- `missionId` passed in result-reveal URL for build-history access after refresh

### Mobile (412×915)

- Owner menu via hamburger; build details bottom sheet; toolbar stacked below owner chrome
- Publish on mobile in owner menu; style templates remain in secondary toolbar row

### Files changed

- `src/lib/storeLaunch/buildHistoryPresentation.ts` (new)
- `src/lib/storeLaunch/storeCreationPromoStream.ts`
- `src/app/console/performer/missionStreamComposer.ts`
- `src/app/console/performer/PerformerBuildHistoryCollapsible.tsx` (new)
- `src/app/console/ConsoleCentreColumn.tsx`
- `src/components/draftPreview/DraftPreviewOwnerChrome.tsx` (new)
- `src/components/publish/WebsitePreviewToolbar.tsx`
- `src/pages/public/WebsitePreviewPage.tsx`
- `src/lib/reviewRoutes.ts`, `src/lib/storeLaunch/storeResultReveal.ts`

### Tests

- `buildHistoryPresentation.test.ts`
- `PerformerBuildHistoryCollapsible.test.tsx`
- `DraftPreviewOwnerChrome.test.tsx`
- `storeCreationPromoStream.test.ts` (result-ready history preservation)

### Live evidence

- Screenshots: **PENDING** post-deploy (MSD + Banh mi Nhu Lan, 412×915)

### Known limitations

- Build details on preview requires `missionId` query param (set by result reveal)
- Full diagnostic trace only in debug mode or Performer console
- Day 5 Share / Improve-with-AI not implemented (by design)

**STOP — Day 5 not started.**
