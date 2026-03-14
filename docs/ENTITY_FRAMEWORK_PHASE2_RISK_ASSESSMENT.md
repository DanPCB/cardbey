# Phase 2 Entity Framework — Risk Assessment (Pre-Implementation)

## Scope
Narrow Phase 2: bodyMode/bodyConfig–aware behavior for Store, Product, and Promotion only. No DB/schema, no mission/draft/publish/guest changes, no new entity types.

## Risks Considered

| Risk | Assessment | Mitigation |
|------|------------|------------|
| **MI helper / store review flow** | Only additive: optional entity fetch and optional presentation prop on MIHelperPanel. Default title "MI Assistant" unchanged when no entity. | New props optional; fallbacks everywhere. |
| **QR landing (MIObjectLandingPage)** | Enhance existing Phase 1 proof consumer: use entity for role label, greeting, quick actions. No removal of current copy when entity missing. | Keep "Chat with {item.name}" as fallback; entity-driven copy only when entity loaded. |
| **Product surface (AmbientMIAssistant)** | Add optional product entity fetch; use for role label and optional extra actions. Existing suggestions and behavior unchanged when entity absent. | Entity is additive; existing "Need help with 'X'?" and suggestions remain default. |
| **Store surface (StoreDraftReview + MIHelperPanel)** | Optional store entity fetch when storeId present; pass presentation to MIHelperPanel. Panel uses role label when provided. | New prop optional; no change to open/close/send flow. |
| **Mission / draft / publish / guest** | No code in orchestra, publish, draft commit, or auth. | No edits to those paths. |

## Conclusion
Proceeding with Phase 2 is **low risk**. All changes are additive and fallback to current behavior when entity is missing or fetch fails.
