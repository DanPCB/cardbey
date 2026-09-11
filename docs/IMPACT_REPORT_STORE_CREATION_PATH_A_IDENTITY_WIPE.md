# IMPACT REPORT — Path A identity wipe + suggested-as-sourced

**Date:** 2026-09-11  
**Status:** Explicit user report — manual URL still yields cuisine mock menu  
**Evidence:** mission `cmtwkasz30008jv4oi1mjqtca`, draft `cmtwkatgg000vjv4o39nixcfl`

## What happened

1. Intake correctly sent `Pho Saigon` + `Melbourne` + `https://phosaigon.com.au`.
2. Mode classifier correctly chose **research** (`has_website`).
3. **`createStoreCheckpointDispatch` re-stamp wiped identity fields**  
   - `createMissionPipeline` returns `{ id, status, stepsCreated }` (no `metadataJson`).  
   - Re-stamp treated `prevMeta` as `{}` and wrote only `missionId` / `userId` / website keys.  
   - Correct fields survived only inside `deferredStorePipeline.body`.
4. **`structured_store_build` fell back to mission title** → businessName = `"Create store: Pho Saigon"`, location empty → `"Location unavailable"`.
5. Website scrape returned 0 items; Places candidates rejected (bad identity/location).
6. Empty-menu seed injected Vietnamese cuisine starters, then finalize stamped authority as **`sourced_pending_review`** / item `contentOrigin: sourced` — dishonest.

Screenshots of draft `cmtwhewl700dijv0cbx6fia1g` are the **prior generative** run; the new run produced a **look-alike** cuisine menu under Path A.

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Duplicate metadata keys | Re-stamp always writes identity | Spread DB meta first; only fill missing / always set known truth |
| Title still used as name | Fallback needed when body empty | Strip `Create store:` / `Create mini website:` prefixes |
| Real scraped menus lose sourced label | Over-broad suggested check | Gate on `catalogAuthoritySource` / `suggested_for_real_business` / item `contentOrigin===suggested` only |

## Smallest safe patch

1. `createStoreCheckpointDispatch.js` — load metadata from DB before stamp; always merge `businessName`, `businessType`, `location`.  
2. `structured_store_build.js` — resolve name/location/type from meta → deferred body → `_input`; strip title prefix.  
3. `researchCatalogDraft.js` — do not stamp suggested-for-real-business cuisine as sourced; keep `pleaseVerifyMenu` + suggested origin.

## Explicitly not doing

- Fixing `phosaigon.com.au` scrape parser in this patch  
- Intake UX / payload-guard website strip redesign  
- Forcing Places match when scrape fails
