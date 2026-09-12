# IMPACT REPORT — Rich Media Acquisition V1

**Date:** 2026-09-12  
**Status:** Slices A–D IMPLEMENTED (2026-09-12)  
**Route:** `/admin/discovery` → Rich Media Acquisition · API `/api/media-acquisition/*`  
**Deferred:** `docs/AUTONOMOUS_MEDIA_DISCOVERY_V4.md`  
**Non-goal:** General web crawler; new Universal Library domain; scraping social for custody

---

## Goals (mission summary)

Reorganize Content Discovery Agent admin into a **Rich Media Acquisition** product surface and federate approved open-media APIs through a normalized candidate → rights → acquire pipeline that persists into **existing Universal Library / URI**, not a new library SSOT.

Pipeline: `DISCOVER → QUALIFY → ACQUIRE → ENRICH → PUBLISH/REUSE`

---

## What could break

| Risk | Why | Impact scope | Mitigation |
|------|-----|--------------|------------|
| Business crawl agent becomes unreachable | Replacing `/admin/discovery` UI wholesale | Ops using seed crawl / Run Now / batches | Keep `DiscoveryControlPanel` intact under **Sources / Operations**; shell-only redesign first |
| Accidental download of social/reference media | Treating TikTok/YouTube/web crawl as acquireable | Legal/custody; SSRF | REFERENCE_ONLY policy for CREATIVE_PLATFORM / untrusted sources; never call download before rights decision |
| Duplicate catalogue records | Parallel Pexels/UL/URI paths | UL noise, dedupe debt | Acquire via URI→UL bridge; dedupe on `provider` + `providerRemoteId` / `sourceUrl` |
| Rights auto-clear too aggressively | Expanding `openMediaRights` without review | Publish of restricted assets | Agent recommends; policy engine decides; default fail-closed; MANUAL_REVIEW when confidence low |
| `/api/discovery` contract confusion | Mixing business seeds with media candidates | API consumers, admin | New media search under URI/UL federation routes (or `/api/media-acquisition/*`); do **not** overload business seed endpoints |
| Null crash on discovery page | `setSeeds(res.seeds)` when `seeds` null | `/admin/discovery` unusable | Fix null coalesce + failed-fetch isolation (Phase 15) before/with shell |
| Content Acquisition page drift | Two admin UIs for same job | Operator confusion | Bridge Library tab to `/library` + reuse Content Acquisition ops patterns; do not fork pipeline |
| Scheduler / seed CRUD regression | Touching DiscoveryBatchRunner while adding media | UnclaimedStore pipeline | Leave crawler runner untouched in V1; only relocate UI |

---

## Why (architecture facts from audit)

1. **`/admin/discovery` today is a business-store crawler**, not a media acquisition product (`DiscoverySeedSource` → scrape → `UnclaimedStore`).
2. **Media federation already exists** under URI Provider SDK: Pexels, Openverse, Pixabay, Unsplash, Wikimedia — with `normalizeAdapterHit`, custody modes, fail-closed rights.
3. **Universal Library is the asset SSOT** (`UniversalAsset` + rights/hosting fields). Content Acquisition at `/control-center/content-acquisition` already operates population/rights/duplicates.
4. **Freesound exists** on the Audio Library path, not yet as a URI Provider SDK adapter.
5. **Parallel media models** (VideoResult, ContentAsset, PexelsPhoto, NormalizedAudioTrack) should not be extended — normalize at the acquisition boundary.

---

## Impact scope

| Area | Touch level |
|------|-------------|
| Dashboard `/admin/discovery` shell + tabs | **Primary** — new workspace UI |
| `DiscoveryControlPanel` | **Preserve** — nest under Sources |
| URI adapters / normalize / rights | **Adapt** — DiscoveryCandidate mapping + acquisition decision enums |
| UL sync / acquire / provenance | **Adapt** — remote reuse default; custody only when policy allows |
| Freesound | **Minimal new** — URI adapter wrapping existing client **or** federated call into audio search |
| Business DiscoveryBatchRunner / scheduler / seeds API | **No change** in V1 except UI relocation |
| Content Acquisition / `/library` | **Bridge**, not replace |
| Autonomous Performer media discovery | **Deferred V4 \(Autonomous Media Discovery\)** — architecture hooks only |

---

## Smallest safe patch (implementation order)

### Slice A — Stabilize + shell (no new domain)
1. Fix null `seeds` / `batches` / loading / failed-fetch on `DiscoveryControlPanel`.
2. Replace `DiscoveryAdminPage` with tabbed shell: Discover | Review | Library | Sources.
3. Mount existing `DiscoveryControlPanel` under **Sources** unchanged.
4. Discover/Review/Library tabs can start as stubs that call URI search + UL list.

### Slice B — Federated search (reuse URI)
1. Add thin `DiscoveryCandidate` DTO mapping from URI Unified Resource (do not invent a second library).
2. Parallel search across registered adapters with per-source status isolation.
3. Rights policy layer mapping to: INDEX_ONLY | REFERENCE_ONLY | REMOTE_REUSE | DOWNLOAD_ALLOWED | DOWNLOAD_WITH_ATTRIBUTION | MANUAL_REVIEW | BLOCKED.
4. Keep relevance / quality / rightsConfidence as separate scores.

### Slice C — Acquire into UL
1. Confirm rights → decide REMOTE_REUSE vs DOWNLOAD.
2. Persist via existing UL intake / federation sync patterns + provenance metadata.
3. Default **no custody**; REFERENCE / PROVIDER_HOSTED.
4. Review queue for MANUAL_REVIEW / attribution capture.

### Slice D — Connectors completeness
1. Declare operational: Openverse, Wikimedia, Pexels (existing).
2. Pixabay: enable search path (already adapter); UL sync optional.
3. Freesound: wrap existing `freesoundClient` into federation search for audio.
4. TikTok / YouTube / Instagram / web crawl seeds: REFERENCE_ONLY / discovery-only labels in Sources UI — no download.

### Explicitly not doing in V1
- New Universal Library replacement
- General crawler framework
- Scraping TikTok/IG/FB/YT for custody
- Full AI enrichment blocking acquisition
- Autonomous download/publish from Performer
- Replacing Content Acquisition Control Center page

---

## Reuse decision matrix (capability → classification)

| Capability | Decision | Existing SSOT / asset |
|------------|----------|------------------------|
| Asset catalogue | **REUSE_EXISTING** | `UniversalAsset` / `/api/universal-library` |
| Federated open-media search | **ADAPT_EXISTING** | URI Provider SDK + adapters |
| Normalize hits | **ADAPT_EXISTING** | `normalizeAdapterHit` → map to `DiscoveryCandidate` for UI |
| Rights classify (license strings) | **ADAPT_EXISTING** | `openMediaRights.js` + `rightsIntelligence.js` |
| Custody / download policy | **ADAPT_EXISTING** + **BUILD_MINIMAL_NEW_LAYER** | URI `CUSTODY_MODE` + acquisition decision enum for UI/actions |
| Pexels / Openverse / Wikimedia / Pixabay | **REUSE_EXISTING** | URI adapters (+ UL sync where present) |
| Freesound | **ADAPT_EXISTING** | `lib/audio/freesoundClient.js` → thin URI/federation wrapper |
| Unsplash | **REUSE_EXISTING** (optional V1+) | URI adapter already registered |
| Dedup | **ADAPT_EXISTING** | `providerRemoteLookup` + URI fingerprint; hash only on download |
| Object storage | **REUSE_EXISTING** | `lib/storage` — only if DOWNLOAD_ALLOWED |
| Enrichment (OCR/transcript) | **ADAPT_EXISTING** (async, non-blocking) | URI `metadataIntelligence`; vision OCR elsewhere — do not block acquire |
| Business seed crawler | **REUSE_EXISTING** | Keep under Sources ops — not media acquire path |
| Admin media UX | **BUILD_MINIMAL_NEW_LAYER** | New shell on `/admin/discovery`; bridge Library to `/library` |
| Review queue | **BUILD_MINIMAL_NEW_LAYER** | Prefer URI reuse sessions / lightweight queue store if no durable review queue exists |
| Query planner / expansion | **BUILD_MINIMAL_NEW_LAYER** | Deterministic expansion first; no unrestricted crawl |
| Content Acquisition CC page | **REUSE_EXISTING** | Patterns + APIs; do not duplicate pipeline |

---

## Seeds null bug (Phase 15 root cause)

**File:** `apps/dashboard/.../DiscoveryControlPanel.tsx`

```ts
setSeeds(res.seeds);      // no ?? []
setBatches(res.batches);  // no ?? []
```

If `/api/discovery/seeds` fails partially, returns non-ok body, or `seeds` is null, subsequent `seeds.some` / `seeds.length` throws (`can't access property "seeds", _e is null` may also come from nested access on a null response object in minified builds).

**Fix:** coalesce to `[]`, guard refreshAll per-call so one endpoint failure does not leave state null, surface error without crashing.

**Secondary:** API seed create validation rejects `web_crawl` / `website` that UI offers — operational bug, fix under Sources (align validators with runner) without blocking media work.

---

## Acknowledgement gate

Per Development Safety Rule: **no implementation until this report is acknowledged** (or user explicitly says proceed).

Proposed first code commit scope after proceed: **Slice A only** (null-safe ops panel + tabbed Rich Media Acquisition shell with Sources nesting existing controls).
