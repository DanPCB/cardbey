# Impact Report — External Resource Federation Activation V1

**Date:** 2026-08-09  
**Scope:** URI/Federation provider status + Openverse/Wikimedia UL intake + Content Acquisition truth + Performer find_resources  
**Ontology:** Resources supply Performer (no new product surface)

## VERDICT

`EXTERNAL_RESOURCE_FEDERATION_V1_READY` (code path) — **staging/production sync + Use-this smoke still required after deploy.**

Architecture proof: a fourth provider can be added as an adapter + ops-intake branch **without** Library/Performer/destination UI changes → **YES**.

## AUTHORITATIVE PROVIDER REGISTRY

**Core URI Provider SDK → Source Federation**  
`bootstrapProviderAdapters` / `registerProviderAdapter` / `federationProviderStatus.js`

Dashboard `createFutureProviderContract` stubs are **not** authoritative.

## WHY PEXELS UI PREVIOUSLY SAID DISABLED

Content Acquisition Sources tab listed dashboard stubs with `enabled: false` / `externalApiEnabled: false` (“No external API”), while live Library Pexels rows came from Core `runPexelsLibrarySync` + `PEXELS_API_KEY`. **First divergence:** same name, two registries.

## PROVIDERS

| | Pexels | Openverse | Wikimedia |
|--|--------|-----------|-----------|
| CONFIGURED | `PEXELS_API_KEY` | no key | User-Agent (`WIKIMEDIA_USER_AGENT` / `WIKIMEDIA_CONTACT`) |
| HEALTH (local probe) | MISCONFIGURED without key | HEALTHY | HEALTHY |
| DISCOVERY | ON when external open provider flag + key | ON when flag | ON when flag |
| REUSE | ON (REFERENCE / provider-hosted) | ON (rights fail-closed) | ON (rights fail-closed) |
| CUSTODY | PROVIDER_HOSTED / REFERENCE | same | same |
| RIGHTS | Pexels License → CLEARED | CC0/BY/BY-SA only; else REJECTED_RIGHTS | same fail-closed |
| INDEXED COUNT | existing UL rows | after Sync now | after Sync now |
| LAST LIVE TEST | needs key in env | HEALTHY | HEALTHY |

Deferred: YouTube, Pixabay (adapter only), Unsplash (adapter only), Internet Archive — REGISTERED / DISABLED for UL sync.

## PERFORMER RESOURCE SEARCH

`POST /api/universal-library/find-resources` — index-first, partial Federation on underfill, per-provider error isolation.  
Dashboard: `findResourcesForPerformer` (proposals only; Use this remains governed).

## LIBRARY INTEGRATION

No ResourceCard / Library page provider forks. Existing public asset DTO + Use this → URI bridge.

## RIGHTS VALIDATION

`classifyOpenMediaLicense` fail-closed; `publishUniversalAsset` still requires CLEARED. No second rights engine.

## DEDUPLICATION

`provider` + `metadata.providerRemoteId` via `findAssetByProviderRemoteId`.

## ADMIN UI

`/control-center/content-acquisition` Sources tab reads Core federation status; Test / Sync now for V1 active sources.

## ENVIRONMENT CONFIG

| Provider | Credential | Local | Staging | Production |
|----------|------------|-------|---------|------------|
| Pexels | `PEXELS_API_KEY` | set if testing | required | required |
| Openverse | none | OK | OK | OK (rate limits) |
| Wikimedia | `WIKIMEDIA_USER_AGENT` or `WIKIMEDIA_CONTACT` | recommended | set | set |
| Gate | `ENABLE_FIRST_EXTERNAL_PROVIDER_V1` / `ENABLE_EXTERNAL_OPEN_PROVIDER_V1` | | | |

## FILES CHANGED

Core: adapters (Wikimedia), openverse/wikimedia sync, federationProviderStatus, opsIntake, findResources, openMediaRights, routes, .env.example, tests, this report.  
Dashboard: ContentAcquisitionPage Sources, universalLibraryApi federation helpers, libraryResourceUse find helper.

## MIGRATIONS

None.

## TESTS

`openMediaRights`, `wikimediaCommonsAdapter`, `providerSdkContract` (includes src_wikimedia).

## LIVE/STAGING VERIFICATION

After deploy: open Sources tab → Test/Sync Pexels, Openverse, Wikimedia → confirm Library cards → Use this → Performer for one asset per provider. Break one provider → others continue.

## KNOWN LIMITATIONS

- Live Federation candidates from `find-resources` are proposals until indexed (prefer Sync for Library Use this).
- Pixabay/Unsplash URI search adapters remain registered but UL catalogue sync deferred.
- Pexels health without `PEXELS_API_KEY` is MISCONFIGURED (truthful).

## ARCHITECTURE PROOF

Fourth provider = new adapter + `opsIntake` branch + status catalog entry. No Library/Performer/destination workflow changes required → **YES**.
