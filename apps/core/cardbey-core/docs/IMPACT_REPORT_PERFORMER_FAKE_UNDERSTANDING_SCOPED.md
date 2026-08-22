# Impact Report: Performer “fake understanding” fix (scoped)

## Requested master prompt vs locked constraints

The master prompt asks for a new `CanonicalBusinessUnderstanding` SOT, force-enable BUE, decision-loop authority, and hard-block create-store until name+category+location ≥70% confidence.

That conflicts with:

- Intent Runtime Foundation — **wrap, don’t rewrite**; no parallel stack beside Kernel / StoreCandidate / Mission Runtime
- Automation by Default — incomplete drafts may proceed to a **checkpoint**, not a hard wall for every missing field
- Invisible Assistance — ask last, not first

## What could break (if master prompt applied verbatim)

1. Logo-only uploads never create-store (category/location often absent).
2. Dual identity systems (new Map cache vs Core `StoreCandidate`) diverge.
3. Enabling `BUE_PIPELINE_ENABLED` in repo does not set Render; production behaviour unclear.
4. Rewriting `resolveIntakeMissionBinding` with invented `getMission` / `createMissionFromUnderstanding` APIs breaks binding.
5. Replacing entire `handleSelection` breaks validation_error, duplicate_store, draft confirm paths.

## Smallest safe patch (this PR)

1. **Honest progress copy** — remove fake “Reading business details…”; show status from image-bound handoff / validation only.
2. **Image-bound identity on handoff** — `imageHash` + clear identity when pixels change (extend existing handoff; no parallel BUE SOT).
3. **Create-store gate** — refuse to POST create_store when handoff identity is missing or bound to a different imageHash; surface missing fields / ask to wait for extraction for **this** image.
4. **Mission detach** — keep/strengthen new-upload detach (already partially shipped).
5. **Tests** for placeholder removal, hash mismatch block, same-image proceed seed.

## Explicitly deferred (not in this PR)

- Enabling BUE / brand vision in production env
- New mandatory CanonicalUnderstanding cache as platform SOT
- Decision-loop re-enable as create-store authority
- Soft/strict feature-flag rollout phases 2–3 beyond client gate

## Success for this slice

- PTH / Handyman / Coffee uploads do not continue VIETNAMESE RESTAURANT
- UI never claims “Reading…” without image-bound data
- Create-store chip does not fire against mismatched/stale identity

