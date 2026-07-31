# Impact Report — Storefront Design Library Phase 4 (Blueprint Scoring)

**Date:** 2026-07-31  
**Scope:** Score registered storefront blueprints; attach advisory recommendation metadata  
**Flag:** `ENABLE_DESIGN_LIBRARY_V1` (unchanged authority: `isDesignLibraryAuthoritative() === false`)

## Boundary

Phase 4 answers: **which storefront structure best fits this business and why?**

It does **not**:

- Change React section order or rendering  
- Change live CTA controls  
- Apply a blueprint to the public site  
- Alter `websiteTemplateId` / legacy theme template ID / publish snapshots  
- Score themes (deferred)

## Scoring inputs

| Source | Fields used |
|--------|-------------|
| Phase 2 | `contentRole` counts / classification summary |
| Phase 3 | inferred `businessModel`, primary/secondary actions, evidence summary |
| Facts / profile | businessName, phone, booking, hours, location, media flags |
| Owner intent | `preferredBlueprintId` or preview sample → blueprint |
| Registry | registered blueprint definitions |

Does **not** re-run research or inspect React layout state.

## Module

`src/lib/storefrontDesignLibrary/scoring/`

| File | Role |
|------|------|
| `scoringWeights.js` | Versioned weights (`SCORER_VERSION = 1`) |
| `blueprintEvidence.js` | Gather scoring evidence |
| `blueprintScorer.js` | Score one blueprint (dimensions + eligibility) |
| `blueprintScoreResult.js` | Result freeze + deterministic compare |
| `scoreRegisteredBlueprints.js` | Score full registry |
| `recommendBlueprintsForDraft.js` | Select + alternatives + attach meta + event |

## Dimensions and weights (provisional)

| Dimension | Weight |
|-----------|--------|
| businessModelFit | 0.30 |
| contentCoverage | 0.25 |
| actionFit | 0.20 |
| requiredDataReadiness | 0.10 |
| mediaTrustReadiness | 0.10 |
| ownerPreference | 0.05 |

Primary CTA contributes 75% of actionFit; secondary 25%.  
Weights are central and observable during soak — not buried in conditionals.

Score range: **0–1** (UI may later show %).

## Eligibility (cautious hard rules)

Marked ineligible only for strong contradictions:

- `restaurant-menu` without menu/restaurant evidence and model ≠ restaurant  
- `retail-commerce` without product/commerce evidence and model ≠ retail  
- `service-booking` without booking evidence when model is `service_quote`

`portfolio-showcase` remains a valid alternative for many service businesses.

Owner preview preference adds a **bounded** boost and is **blocked** when the blueprint is ineligible or business-model fit is ≤ 0.25 (visual intent ≠ structural win).

## Recommendation contract

```ts
{
  selected,                 // BlueprintScoreResult
  alternatives,             // up to 2
  allScores,                // all registered, sorted
  confidence,               // 0–1
  recommendationReason,
  authoritative: false,
  scorerVersion
}
```

Sort: score descending, then `blueprintId` ascending.

## Metadata integration

After Phase 2 + Phase 3 on finalize / suggested stamp:

```json
{
  "designLibraryBlueprintRecommendation": {
    "selectedBlueprintId": "trade-lead-generation",
    "selectedScore": 0.92,
    "alternatives": [{ "blueprintId": "portfolio-showcase", "score": 0.73 }],
    "confidence": 0.76,
    "reasons": ["business_model_preferred", "primary_action_supported", "..."],
    "recommendationReason": "...",
    "authoritative": false,
    "scorerVersion": 1
  }
}
```

Does not mutate classification, commerce policy, `contentOrigin`, prices, or live CTA fields.

## Observability

Event: `storefront.blueprint.scored` (dev / `DESIGN_LIBRARY_POLICY_LOG=1`).

Debugger may show recommended structure + alternatives; not on the public storefront.

## Feature-flag behaviour

| Flag | Behaviour |
|------|-----------|
| Off | No scoring metadata; no behaviour change |
| On | Advisory recommendation attached; no renderer / generation cutover |

## What could break

| Risk | Why safe |
|------|----------|
| Wrong structural recommendation in meta | Advisory only; public site unchanged |
| Downstream assumes authority | Explicit `authoritative: false` |
| Score noise on sparse catalogs | Lower confidence; still returns a recommendation |

**Rollback:** `ENABLE_DESIGN_LIBRARY_V1=false`.

## Impact scope

- Draft/research catalog finalize + suggested stamp (metadata only)  
- Design-library diagnostics (`scorerVersion`)  
- No public storefront, publish, payments, or messaging changes  

## Smallest safe patch

Additive `scoring/` module + attach after Phase 3 in `researchCatalogDraft.js`. No Prisma migration. No renderer / BSL / transaction-mode edits.

## No-parallel-stack proof

Does not introduce a second live template engine. Live path remains ContentTemplate + websiteTemplateFoundation + miniWebsite until a future authoritative cutover.

## Modern Security Doors result (fixture, not hardcoded domain)

| Field | Value |
|-------|--------|
| Selected | `trade-lead-generation` (~0.92) |
| Alternative | `portfolio-showcase` (~0.73) |
| `service-booking` | ineligible (no booking; `service_quote` + `request_quote`) |
| `restaurant-menu` | ineligible (no menu evidence) |
| Live `primaryCTA` | may still be Book (unchanged) |

## Confidence calculation

```
selected.score × 0.45
+ businessModelConfidence × 0.25
+ (selected − second) gap × 0.20
+ evidence richness × 0.10
```

Clamped to 0–1.

## Test results

```text
pnpm exec vitest run src/lib/storefrontDesignLibrary
  Phase1: 16
  Phase2: 20
  Phase3: 12
  Phase4: 20
  Total: 68 passed

node -e "import('./src/lib/storefrontDesignLibrary/scoring/index.js')" → ok
```

Fixtures covered: MSD / trades, beauty+Fresha, restaurant+reservation, retail, portfolio/agency, minimal + preview preference, flag off/on, provenance preservation, determinism, owner-preference bounds.

## Phase 5 status

Implemented — see `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE5_PROJECTION.md`.
