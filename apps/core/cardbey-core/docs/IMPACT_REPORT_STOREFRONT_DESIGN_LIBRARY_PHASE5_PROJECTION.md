# Impact Report — Storefront Design Library Phase 5 (Section Projection)

**Date:** 2026-07-31  
**Scope:** Advisory `StorefrontProjection` (section plan) from classification + commerce policy + selected blueprint  
**Flag:** `ENABLE_DESIGN_LIBRARY_V1` (unchanged authority: `isDesignLibraryAuthoritative() === false`)

## Projection boundary

Phase 5 answers:

- Which sections should this storefront contain?
- In what order / priority?
- Which content belongs in each section?
- Which section variant is suitable?
- What should be hidden, collapsed, or footer-only?

It does **not** change the public React renderer, live CTAs, publish snapshots, or template application.

## Input contracts

| Source | Used for |
|--------|----------|
| Phase 2 | `contentRole`, confidence, classification summary |
| Phase 3 | `businessModel`, primary/secondary actions |
| Phase 4 | `selectedBlueprintId` (+ score metadata preserved) |
| Registry | Blueprint `defaultSections`, actions, fallbackBehaviour |
| Catalog | `contentOrigin`, `needsOwnerReview`, item refs |
| Facts | location / hours / booking / media flags (read-only) |

Does not re-run research, invent prices, or mutate source evidence.

## Module

`src/lib/storefrontDesignLibrary/projection/`

| File | Role |
|------|------|
| `contentRoleMapper.js` | Canonical role → section mapping |
| `sectionVariantSelector.js` | Deterministic variants by count/media |
| `projectionEvidence.js` | Gather items + facts for projection |
| `sectionProjector.js` | Per-section visibility, items, CTA hints |
| `storefrontProjector.js` | Full projection assembly |
| `projectionValidator.js` | Structural + placement validation |
| `projectStorefrontForDraft.js` | Flag-gated attach + event |
| `projectionResult.js` | Freeze helpers + warning codes |

## Role-to-section mapping (summary)

| Content role | Section |
|--------------|---------|
| `service_category` | `service_categories` |
| `service` | `services` |
| `product` / `product_category` | `products` |
| `menu_item` / `menu_category` | `menu` |
| `project` | `projects` |
| `gallery` | `gallery` |
| `testimonial` | `testimonials` |
| `trust_content` | `trust` |
| `policy` | `policies` (footer_only) |
| `career` / `blog` / `support` | `footer` |
| `navigation` | omitted (hidden) |
| `unknown` | collapsed review bucket in metadata |

Policies / careers / testimonials never map into `services` / `products` / `menu` / `featured_items`.

## Visibility rules

- Section is **not** visible solely because it exists on the blueprint  
- Optional section without matching content → `hidden` or `collapsed` per `fallbackBehavior`  
- `projects` / `gallery` without media or items → `hidden`  
- `policies` → `footer_only`  
- `hero` / `quote` / `contact` / `footer` → structural visible (soft required-data warnings)  
- Suggested content only when `fallbackBehavior` allows (`allow_suggested` / `request_input`)

## Variant selection

Deterministic examples:

- Service categories: 1–3 `compact-cards`, 4–8 `card-grid`, 9+ `grouped-list`  
- Testimonials: 1 `featured-quote`, 2–5 `cards`, 6+ `carousel`  
- Gallery/projects: few `masonry-small`, many `grid`, none → hidden  

Effective support = blueprint `supportedVariants` ∪ projection catalog for that role.

## CTA placement (advisory)

`metadata.preferredActions` on sections from Phase 3 policy (e.g. `request_quote` → hero / services / quote / footer).  
Does not change live buttons.

## Review and origin handling

- `contentOrigin`: `sourced` | `suggested` | `mixed` | `none`  
- Any included `needsOwnerReview` → section `requiresOwnerReview` + warning `OWNER_REVIEW_REQUIRED`  
- Suggested/mixed → warning `SUGGESTED_CONTENT_USED`

## Validator behaviour

Validates: section roles, variants, duplicate IDs, numeric priority, item refs, placement rules, `authoritative === false`.

| Environment | Invalid projection |
|-------------|-------------------|
| Dev / test | Diagnostic logged; attach skipped |
| Production advisory | Diagnostic logged; attach skipped; live path unchanged |

## Integration metadata

After Phase 4 on finalize / suggested stamp:

```json
{
  "designLibraryStorefrontProjection": {
    "blueprintId": "trade-lead-generation",
    "businessModel": "service_quote",
    "primaryAction": "request_quote",
    "sections": [ /* ... */ ],
    "authoritative": false,
    "projectorVersion": 1
  }
}
```

Does not alter `preview.website.sections`, `websiteTemplateId`, legacy theme IDs, publish snapshots, or live CTAs.

## Observability

Event: `storefront.projection.completed` (dev / `DESIGN_LIBRARY_POLICY_LOG=1`).

Debugger may show recommended structure + section checklist; not on the public storefront.

## Feature-flag behaviour

| Flag | Behaviour |
|------|-----------|
| Off | No projection metadata |
| On | Advisory projection attached when Phase 4 recommendation exists |

## What could break

| Risk | Why safe |
|------|----------|
| Wrong section plan in meta | Advisory only; public renderer unchanged |
| Validation rejects projection | Attach skipped; legacy path preserved |
| Downstream assumes authority | Explicit `authoritative: false` |

**Rollback:** `ENABLE_DESIGN_LIBRARY_V1=false`.

## Impact scope

- Draft/research catalog finalize + suggested stamp (metadata only)  
- Design-library diagnostics (`projectorVersion`)  
- No public storefront, publish, payments, or messaging changes  

## Smallest safe patch

Additive `projection/` module + attach after Phase 4 in `researchCatalogDraft.js`. No Prisma migration. No renderer edits.

## No-parallel-stack proof

Does not introduce a second live renderer. Live path remains ContentTemplate + websiteTemplateFoundation + miniWebsite until a future cutover flag (Phase 6).

## Modern Security Doors projection (fixture)

| Field | Value |
|-------|--------|
| Blueprint | `trade-lead-generation` |
| Model / CTA | `service_quote` / `request_quote` (+ `call`) |
| Visible | hero, service_categories (`grouped-list`), services (specific service only), trust, testimonials, quote, contact, footer |
| Hidden | projects (no media) |
| Footer-only | policies (Return/Payment/Customer/Terms) |
| Career | footer itemRefs (`careerPlacement: footer_only`) |
| Not in services | Testimonials, Career, Terms |

## Test results

```text
pnpm exec vitest run src/lib/storefrontDesignLibrary
  Phase1: 16
  Phase2: 20
  Phase3: 12
  Phase4: 20
  Phase5: 16
  Total: 84 passed

node -e "import('./src/lib/storefrontDesignLibrary/projection/index.js')" → ok
```

## Phase 6 status

Implemented — see `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE6_SHADOW_RENDER.md`.
