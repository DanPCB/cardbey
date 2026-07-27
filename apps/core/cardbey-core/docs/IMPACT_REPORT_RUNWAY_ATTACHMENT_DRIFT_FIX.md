# Impact Report: Canonical runway attachment drift fix

**Date:** 2026-07-27  
**Audit:** `docs/AUDIT_CANONICAL_RUNWAY_KERNEL_DRIFT_2026-07-27.md`

## What could break

1. **Loyalty / store-selection replay** — if freeze exemption is too broad, heavy `imageDataUrl` could survive on replay turns and reintroduce 413s.
2. **Ask → Create store** — intended to start working; if exemption is wrong, still `ATTACHMENT_NOT_READY`.
3. **Client handoff** — stopping `pendingImageDataUrl` when pixels are top-level may break paths that only read ISC pending (should use top-level first).

## Why

Ask Create store stamps `evidenceId` on `intakeV2Selection`; client re-sends pixels; Core `hasFrozenUploadEvidenceRef` strips pixels.

## Impact scope

- Core: `intakeReplayPayload.js`, create_store image recovery in routes, upload phase comments
- Dashboard: attachment handoff + evidence registry consolidation
- Not touching: Studio, Intent Runtime ownership, DraftStore schema

## Smallest safe patches

1. P0: Skip freeze strip when create_store-from-upload markers or usable top-level `imageDataUrl`.
2. P1: Client — no pending when pixels outbound; evidence registry delegates to handoff.
3. P2: Recover image from evidence bundle / selection evidenceId before 409.
4. P4: Comment/doc alignment (decision loop hard-off).
5. P3: Durable `assetRef` deferred (no existing chat-upload blob store hook in this slice).

## No-parallel-stack proof

Still one Intake V2 → Store Mission → Kernel → DraftStore path. No new mission type or Intent Runtime owner.
