# Impact Report: Stale upload handoff keeps prior store identity

## Symptom

User uploads a new logo (Mộc Vietnamese Restaurant, CA Handyman Services) while Performer still starts / continues **Create store: PTH INTERNATIONAL FURNITURE · VIC 3026**.

## Exact failure boundary

**Dashboard `setPerformerAttachmentHandoff` merge** — patching only `imageDataUrl` keeps prior `cardExtraction` / `storeCandidate` / evidence / workflow in memory + `sessionStorage`. Ask → Create store re-seeds that into `storeCreateForm` / `intentSourceContext`.

**Core amplifiers:** `resolveStoreCandidateForIntakeTurn` does not pass `currentImageDataUrl`, so session pending extraction stays matched; mission metadata can re-merge PTH. New image uploads while a create_store mission is active often **reuse** the same missionId.

## Smallest safe patch

1. On handoff `imageDataUrl` change → clear identity/evidence fields (unless explicitly provided in the same patch).
2. Pass `currentImageDataUrl` into `resolveStoreCandidateForHandoff`; skip mission-meta merge when image fingerprint mismatches.
3. Detach prior store-creation mission when a new upload image is posted (`(Image attached)` / create-from-upload).

## What could break

- Same-image re-sends that only patch evidence ids must still keep cardExtraction (fingerprint unchanged).
- Explicit `cardExtraction` in the same patch as a new image must still apply (fresh OCR).
- Continuing an in-flight store mission without a new image must still bind to that mission.
