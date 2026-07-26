# LIVE_CARD_UPLOAD_FAILURE_REPORT

**Date:** 2026-07-26  
**Surface:** Performer upload → “I see your upload…” → Create store  
**Status:** Root cause identified and patched (staging smoke still required)

## Executive verdict

**PARTIAL → targeting ROOT_CAUSE_FIXED after staging/production smoke**

The upload itself succeeds and the Ask panel renders. The break is at **Suggested action → Attachment transport**: the Create store chip does not carry durable attachment IDs, and the client clears `imageDataUrl` from in-memory handoff as soon as evidence refs register. On the next tap, intake often runs create_store with refs the multi-instance server cannot resolve to pixels (process-local registry; `data:` URLs are not stored as `assetRef`). Result: composer may show “Create a store” while the mission proceeds without the card image.

## Exact root cause

1. **Chip payload incomplete** — `buildUploadGoalOptions` only sends `{ source: 'upload_ask_selection' }` with no `attachmentIds` / `evidenceId` / `contentHash`.
2. **Client clears pixels too early** — `applyIntakeResponse` sets handoff `imageDataUrl: null` after evidence registration.
3. **Handoff is memory-only** — refresh / route change / remount loses attachment context.
4. **Server registry cannot rehydrate data URLs** — `registerAttachmentIngestion` sets `assetRef: null` for `data:` images; other instances have empty Maps.
5. **Mobile UX** — WorkspaceHeader renders desktop nav (Home / Recent missions / Sign in) on narrow viewports; Performer floating orb (“Need help?”) covers the composer on `/app`.

Broken boundary: **Suggested action** (primary), with contributing **Upload persistence** and **Mission** (empty extraction).

## Lifecycle diagram

```
Upload file → data: URL → intake POST (pixels)
  → Ask clarify options (no attachment ids) [BUG]
  → Client registers evidenceId, clears imageDataUrl [BUG]
  → Tap Create store → transport sends refs only
  → Server cannot resolve pixels → OCR empty / weak draft
```

**Fixed path:**

```
Upload → pixels + session workflow stash + sessionStorage handoff
  → Ask options stamped with evidenceId/attachmentId/contentHash
  → Create store keeps/re-sends pixels OR recovers from session uploadedAsset.imageDataUrl
  → One draft with identity evidence → review
```

## Code changes

| Area | Change |
|------|--------|
| `presentOptions.js` | Stamp attachment refs onto create_store / catalog / analyze options |
| `beliefLoader` / lastUpload | Carry evidenceId, attachmentId, contentHash |
| `performerIntakeV2Routes` | Recover image from session `uploadedAsset.imageDataUrl` for create_store-from-upload |
| `performerAttachmentHandoff.ts` | sessionStorage persistence |
| `intakeAttachmentEvidence.ts` | sessionStorage for registered evidence |
| `useIntakeV2.ts` | Keep pixels until create_store consumes; chip params + force image on selection; disable during submit |
| `WorkspaceHeader.tsx` | Compact mobile header (nav in menu) |
| `performerOrbLayout` / orb gateway | Hide Need help orb on native Performer `/app` |

## Configuration / migration

- No Prisma migration.
- No new env required.
- Multi-instance still relies on session workflow stash + client re-send of pixels for data URLs until durable object storage for chat uploads exists (remaining risk).

## Rollback

Revert the dashboard + core commits that introduce this patch; flag not required (behavior is additive/safer).

## Test results (local)

| Suite | Result |
|-------|--------|
| `presentOptionsUploadAsk.test.js` | PASS |
| `responseBuilder.test.js` | PASS |
| Dashboard vitest for attachment evidence | Blocked by pre-existing `testPath` getter harness issue; logic covered in core + code review |

## Staging evidence

Not yet run in this session — deploy core + dashboard and execute variants A–I on staging with production-equivalent config.

## Production smoke

Not yet run — required before ROOT_CAUSE_FIXED.

## Remaining risks

- Chat uploads still use `data:` URLs rather than durable object storage — large images / proxy body limits can still fail on some networks.
- Process-local evidence registry remains; production must keep sessionKey continuity.
- Full production smoke with real business-card HEIC/JPEG still required before claiming ROOT_CAUSE_FIXED.
