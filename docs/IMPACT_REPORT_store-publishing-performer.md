# Impact / Verification Report: Store Publishing in Cardbey Performer

**Date:** 2026-07-15  
**Scope:** Performer store-draft publish path (UI → runtime → persistence)  
**Constraint:** Single runway — no new direct frontend publish API bypass

## Root cause

Several **pre-execute** breaks stacked on an otherwise registered `publish_store` runtime path:

1. **Missing draft id on chip clicks** — `effectiveDraftId` did not fall back to `inlineWebsitePreview.draftId`, so “Publish my store” often routed to an inert setup card after create-store completed with a visible draft.
2. **Next-step policy required live `storeId`** — draft-only missions never got the policy publish chip.
3. **Mobile Need help? filtered out publish** — fullscreen preview removed publish actions.
4. **Draft action bar lacked a primary Publish control** — Full / Collapse / More only; publish buried in suggested steps.
5. **Begin-publish intents used `autoSubmit: true` without `proposedAction: 'publish'`** — governance could not clear auto-submit; risk of parallel chat publish racing the modal.

Backend `publishDraft` / ui-action `publish_store` registration was **not** the primary break.

## Old publishing route

```
Suggested chip / rare inspector Publish
  → routeStreamOriginArtifactChip / dispatchPerformerNextStepAction(publish_store)
  → often setup_required (!draftId) OR beginPublishStoreFlow
  → (intent autoSubmit:true) + PublishModal
  → confirmed → unifiedDispatch(publish_store) → POST /api/performer/runtime/ui-action → publishDraft
```

Mobile Need help stripped publish; create-store chips omitted publish; policy ignored draftId.

## New canonical publishing route

```
Draft preview [Publish Store]  OR  Suggested next step [Publish my store / Publish Store]
        ↓
publishStoreThroughRuntime({ source, draftId, missionId, clientRequestId, … })
        ↓
beginPublishStoreFlow → governed intent (autoSubmit:false, proposedAction:publish) + PublishModal
        ↓
User confirms → executePublishStore → unifiedDispatch({ type: 'publish_store', confirmed: true })
        ↓
POST /api/performer/runtime/ui-action → handlePublishStore → publishDraft (idempotent)
        ↓
UI: websitePublishBanner / View Published Store; refresh hydrates from APIs + banner
```

## Runtime action used

- Capability / ui-action: **`publish_store`**
- Confirmed execute envelope via existing `unifiedDispatch` → `/api/performer/runtime/ui-action`
- Wrapper: **`publishStoreThroughRuntime`** in `publishStore.service.ts`

## Database records changed

No schema migration. Publish still uses existing `publishDraft` transactional path:

- Business / committed store upsert
- Catalog / media / hero transfer
- `publishedAt` / public listing
- Draft marked committed / transferred when applicable  
Idempotent re-publish returns existing store (no duplicate Business).

## Idempotency method

- Server: existing `publishDraft` committed-draft / slug reuse semantics
- Client: `clientRequestId: publish:${missionId}:${draftId}` on requests; UI `publishStoreBusy` disables double primary CTAs during begin-flow
- Confirmed modal path still the only execute (no silent auto-publish)

## Events / telemetry emitted

Structured `console.info` telemetry (safe ids only):

- `store_publish_clicked`
- `store_publish_runtime_requested`
- `store_publish_validation_failed`
- `store_publish_started`
- `store_publish_succeeded`
- `store_publish_failed`

## Mobile UI fix

- Sticky primary **Publish Store** on mobile draft card (`data-publish-store-primary`)
- Need help? FAB: outer `pointer-events-none`, button `pointer-events-auto`; publish no longer filtered from sheet
- Draft status copy: “Your draft is ready…” → “Your store is live.” after banner

## Files changed (primary)

| Area | File |
|------|------|
| Policy | `apps/core/.../nextStepPolicy.js` |
| Canonical wrapper | `apps/dashboard/.../lib/publish/publishStore.service.ts` (+ types) |
| Governance intents | `submitPerformerIntent.ts`, `performerNextStepAction.ts` |
| Artifact executor | `performerArtifactActionExecutors.ts` |
| Mobile draft UI | `PerformerMobileArtifactExperience.tsx`, `PerformerOwnerPreviewSheet.tsx` |
| Wiring | `ConsoleCentreColumn.tsx`, `postBuildInlineUi.tsx` |
| Tests | publish service, mobile artifact, helpers, nextStepPolicy.publish |

## Tests run

```text
dashboard: vitest publishStore.service, submitPerformerIntent, PerformerMobileArtifactExperience, mobileArtifactExperienceHelpers — PASS
core: vitest nextStepPolicy.publish.test.js — PASS
```

## Manual verification

1. Complete create-store → draft preview with **Publish Store** visible above Full/Collapse/More.
2. Tap **Publish Store** → Publish modal → confirm → store live → **View Published Store**.
3. Tap suggested **Publish my store** → same modal/runtime path (check `[telemetry] store_publish_*` in console).
4. Refresh Performer → published banner / View CTA persists (not SSE-only).
5. Second publish attempt → same store, no duplicate.
6. Mobile 375×812: Need help? does not block Publish; sheet still lists Publish.
7. Failure (e.g. guest): visible message, retryable after sign-in.

## Remaining risks

- Desktop Inspector publish button already existed; primarily strengthened mobile + draftId resolution.
- Full E2E create→publish against live DB not run in this session.
- Typed failure codes beyond existing `publishDraft` / dispatch errors are partially mapped at UI telemetry layer; further mapping can extend handler responses without changing the pathway.
- Headline customization demoted from first-three create chips in favor of publish (still available via later policy / editor).

## Acceptance checklist

| Criterion | Status |
|-----------|--------|
| Manual preview button works | Implemented (mobile draft primary + existing inspector) |
| Suggested next step works | draftId fallback + policy draftId + same wrapper |
| One runtime pathway | `publishStoreThroughRuntime` → `publish_store` |
| Publication persists | Existing `publishDraft` |
| Refresh restores published | Banner + store APIs |
| No duplicate store | Existing idempotent publish |
| Mobile button tappable | Sticky CTA + Need help pointer-events |
| Failures visible / retryable | Modal / toast / telemetry |
