# Testing Report — Universal Execution Context + Loyalty Deliverable UX

**Date:** 2026-07-09  
**Impact doc:** `docs/IMPACT_REPORT_UNIVERSAL_EXECUTION_CONTEXT.md`

## What shipped

| Phase | Outcome |
|-------|---------|
| **1 — Kernel gateway** | `executionContextKernel.js` + `resolveStoreForIntakeTool()` is the single pre-compile store resolver for loyalty, campaigns, and all `requiresStore` intake tools |
| **2 — Mission identity** | Mission header shows store logo/name + “Create Loyalty Program” + location · Current execution space |
| **3 — Live brand preview** | Store picker brand strip + header accent from locked `brandTheme` / `selectedStore` |
| **4 — Owner input miniature** | Loyalty `OwnerInputCard` is a live stamp-card preview (reward + visits update the grid) |
| **5 — Progressive artifact** | `loyaltyProgressiveArtifact` stages: `store_loaded` → `draft_ready` → `awaiting_input` → `complete` (SSE) |
| **6 — Smart defaults** | Confidence ≥ 0.75 + reward/stamps → confirm summary (“I detected… Continue?”) instead of blank asks |
| **7 — Completion** | “Loyalty program ready.” + Ready to Publish / Draft badge + Activate / Edit / Preview / Suitcase / Publish Later / Download / Print PDF |

## Automated tests run (pass)

### Core (`apps/core/cardbey-core`)
```
npx vitest run \
  src/lib/mission/__tests__/executionContextKernel.test.js \
  src/lib/mission/__tests__/resolveExecutionContext.test.js \
  src/lib/intake/__tests__/attachmentAnalysis.p1.test.js \
  src/lib/toolExecutors/loyalty/__tests__/loyaltyProgramDraftArtifactService.test.js
```
**Result:** 4 files, **19 passed**

### Dashboard (`apps/dashboard/cardbey-marketing-dashboard`)
```
npx vitest run \
  src/lib/multiAgent/topologyReviewModel.test.ts \
  src/components/console/cards/OwnerInputCard.test.tsx
```
**Result:** 2 files, **13 passed**

## Manual test plan

### A. Universal gateway (Phase 1)
1. Account with **one** store → loyalty or campaign intent → **no picker**; compiles immediately.
2. Account with **multiple** stores, no active space → rich business cards (logo, category, location).
3. Multiple stores + active session store → **“Create … for ABC Coffee?”** with Yes / Choose another.
4. Select a store → chip/card replay → compile uses **same** `storeId` / `executionContext` (check mission metadata).
5. Campaign (`create_campaign`) with multi-store → same picker wording (“campaign”), not loyalty-only copy.

### B. Mission identity + brand (Phases 2–3)
1. After store lock, header shows **store logo/name**, title **Create Loyalty Program**, context **Melbourne · Current execution space** (or store location).
2. Brand colors from store kit appear on picker preview and header accent.

### C. Owner input miniature (Phase 4)
1. Pause on reward/stamps → card shows miniature loyalty preview, not “Almost done” form only.
2. Typing visits updates stamp grid live; Continue still resumes topology (`POST /owner-input`).

### D. Progressive artifact (Phase 5)
1. During topology run, partial card appears as store loads / draft builds (before final present_review).
2. Mission does **not** mark completed until full `generated_loyalty_program` artifact exists.

### E. Smart defaults (Phase 6)
1. Upload card with clear Free Coffee + 6 stamps and high confidence → confirm summary, not empty fields.
2. Low-confidence / missing reward → still asks only missing fields.

### F. Completion (Phase 7)
1. End state: branded card + QR + Ready to Publish/Draft + actions (Activate, Edit, Preview, Suitcase, Publish Later, Download, Print PDF).
2. Activate still requires confirmation (`confirmed: true`); no silent publish.

## Key files

| Area | Path |
|------|------|
| Kernel | `apps/core/.../mission/executionContextKernel.js` |
| Resolver | `apps/core/.../mission/resolveExecutionContext.js` |
| Intake gate | `apps/core/.../routes/performerIntakeV2Routes.js` |
| Campaign compile | `apps/core/.../mission/dispatchMultiAgentCompilerFromIntake.js` |
| Loyalty compile | `apps/core/.../mission/dispatchLoyaltyFromIntake.js` |
| Progressive | `apps/core/.../loyalty/loyaltyProgressiveArtifact.js` |
| Smart defaults | `apps/core/.../intake/attachmentAnalysis.js` |
| Header | `MissionHeader.tsx`, `getMissionHeaderState.ts`, `ActiveMissionContext.tsx` |
| Owner input | `OwnerInputCard.tsx` |
| Completion | `GeneratedLoyaltyProgramCard.tsx` |

## Residual / follow-ups
- Factory / video routing still has a separate store path (`factoryRoutingContext.js`) — optional Phase 1.5 to fold into kernel.
- Print PDF / Wallet Pass buttons are wired; binary PDF/wallet generation remains placeholder until asset pipeline lands.
- Full E2E loyalty spine with multi-store UI is best validated manually in Performer with `USE_LOYALTY_SPINE=true`.
