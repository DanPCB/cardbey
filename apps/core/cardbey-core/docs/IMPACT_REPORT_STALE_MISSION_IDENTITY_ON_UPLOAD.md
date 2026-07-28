# Impact Report: Stale create-store mission identity after new upload (gap close)

## Symptom (post PR #10 / #23)

Uploading CA Handyman / Coffee / PTH while UI still shows **Create store: VIETNAMESE RESTAURANT** and “setup kicked off” for that name.

## Remaining failure boundaries

1. **`freshStoreMission: true` omitted `detachIncompatible`** — new intake posted without missionId but UI kept the prior Vietnamese Restaurant mission (`endActiveMission` never ran).
2. **`(Image attached)` often never set `hasNewUploadImage`** — composer/OCR effects update handoff to the new pixels *before* `handleSend`, so replacement detection sees same-to-same and does not detach.
3. **`handleAssetIntentSelect('create_store')` re-copied** prior `cardExtraction` / `storeCandidate` into the handoff in the same patch as the new image, defeating clear-on-replace.
4. **`isStoreCreationMission` miss** when intent/type sparse — title like “Create store: …” should still detach.

## Smallest safe patch

- Detach prior store/website mission on `freshStoreMission`, on image-attached goals, and on `hasNewUploadImage` (title-aware).
- Stop re-injecting stale OCR in asset-intent create_store.
- Force `hasNewUploadImage` for `(Image attached)` / create-from-upload while a store mission is active.

## What could break

- Continuing the *same* store mission after attaching the *same* image again will start a fresh mission (acceptable; identity safety over reuse).
- Non-store missions with an image attach are unchanged unless store/website family matches.
