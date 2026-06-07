# Explore Knowledge Hub — Pre-implementation audit

## Current `/frontscreen` idle layout (unchanged visibility rules)

```
Hero → Breadcrumb → Search → [Journey panel | Search results | Carousel + Knowledge Hub]
```

Knowledge Hub renders only when `activeIntentJourney === null && searchQuery === ''` (same gate as the intelligence carousel). Journey and search modes are untouched.

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Performer auto-submit | New CTAs could bypass governance | All hub actions call `handleKnowledgePerformerStart` → `handleCapabilityAction` → `launchExploreCapability` (`autoSubmit: false`) |
| Carousel / recommendation engine | Extra UI below carousel | Hub is additive; `getExploreIntelligenceItems` and `exploreRecommendationEngine` unchanged |
| VI store CTA "Tạo cửa hàng" | Duplicate or conflicting label | `store_builder` uses `launchCapabilityId: create_store`; VI `startLabel` matches existing capability copy |
| Mobile scroll / layout | Long idle page | Sections stack vertically; video row uses horizontal scroll with `no-scrollbar` |
| Missing i18n keys | Raw key strings in UI | `explore.knowledgeHub.*` added EN + VI; contract test covers representative keys |
| Invalid capability routing | Registry typo | `exploreKnowledgeHubRegistry.test.ts` asserts all launch IDs exist in `exploreCapabilityRegistry` |

## Impact scope

- **Touched:** `ExploreDiscoveryPage` (conditional render), new hub components, local registry, i18n resources.
- **Not touched:** Journey panel, unified result builder, intent resolver, carousel rotation logic, recommendation waterfall, core Performer runtime.

## Smallest safe patch (applied)

1. Local registry (`exploreKnowledgeHubRegistry.ts`) — no CMS, no API.
2. Presentational components below carousel on idle state only.
3. Reuse existing `getExploreCapabilityById` + `launchExploreCapability` handoff.
4. EN/VI strings in `publicFeedExploreResources.js`.

## Acceptance checklist

- [x] What's New section
- [x] User Guide / Learn Cardbey video section (placeholder cards; routes to Performer)
- [x] Eight capability information cards with title, description, actions, Learn more, Start with Performer
- [x] Goal-based Explore carousel preserved above hub
- [x] Local registry first
- [x] EN/VI i18n
- [x] Recommendation engine and Performer launch flow unchanged
- [x] VI `Tạo cửa hàng` on Store Builder card
