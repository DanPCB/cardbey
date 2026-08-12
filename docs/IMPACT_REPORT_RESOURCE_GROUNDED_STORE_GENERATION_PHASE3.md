# Impact Report — Resource-Grounded Store Generation Phase 3

## Verdict target

Pilot-ready only if Phase 2 restored+committed and Phase 3 tests + assembly path pass.
Staging six-business screenshots remain a qualitative gate (structural evidence generated in Phase 2 pilot HTML).

## What could break

1. finalizeDraft latency/cost when URI search enabled
2. Empty image slots (`needs_media`) vs prior Pexels invent
3. Owner/imported hero skipped incorrectly if source tags wrong

## Smallest safe patch

- `groundedResourceBundle.js` + `resolveGroundedResources.js`
- Flag `ENABLE_RESOURCE_GROUNDED_STORE_GENERATION_V1` (requires Phase 2 flag)
- `finalizeDraft` attach before legacy fill
- Unit tests with mocked URI search

## Rollback

Unset Phase 3 flag → Phase 2 composition-only behaviour.
