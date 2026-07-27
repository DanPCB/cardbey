# Impact Report — V2.2 Enrichment Suggestions (Accept via Performer Runtime)

Date: 2026-06-16  
Scope: Business Activation Runway V2 (dashboard + core runtime)

## 1) What could break

1. **Runtime UI-action dispatch could reject the new action.**
   - Symptom: “Unknown UI runtime action” or capability not found when clicking “Accept suggestions”.

2. **Performer Runtime route could be missing, returning 404/500.**
   - Symptom: UI attempts accept, but `/api/performer/runtime/capabilities/accept-enrichment-suggestion` is not available or fails.

3. **Activation preview response could change shape and break older UI code.**
   - Symptom: Activation page fails to render if it assumes fields are always present.

4. **Accidental enrichment auto-apply / overwrite risk (must not happen).**
   - Symptom: Seed/store/profile/media data changes when enrichment runs or when suggestions are accepted.

## 2) Why

- V2.2 introduces a **new runtime action** (`accept_enrichment_suggestion`) and a **new optional preview field** (`preparedSuggestions`) that need to be wired consistently across:
  - core runtime action registry
  - performer runtime routes
  - dashboard runtime client + capability selector
  - activation UI render paths

## 3) Impact scope

- **Dashboard:** `/activate-business/:seedId` page (display + accept button).
- **Core API:** public activation preview endpoint `GET /activate-business/:seedId` (optional additions only).
- **Runtime:** performer runtime UI-action router + capability execution.
- **Control Center:** optional enrichment metrics exposure (if wired).

## 4) Smallest safe patch (proposed)

1. **Keep activation flow unchanged by default.**
   - Add `preparedSuggestions?: PublicPreparedSuggestion[]` as *optional*.
   - If absent/empty, UI renders a clean empty state and continues activation runway normally.

2. **Enrichment remains suggestions-only.**
   - Enrichment agent may create `EnrichmentCandidate` records, but does not write to seed/store/profile/media.

3. **Accept routes through Performer Runtime only.**
   - UI calls `executeUiRuntimeAction({ action: 'accept_enrichment_suggestion', ... })`.
   - Core runtime capability only:
     - marks candidates `accepted` in `EnrichmentCandidateStore`
     - creates a governed mission + suitcase metadata handoff for Performer
   - No direct UI writes and no overwrites of business/profile/media fields.

## Confirmation checkpoint

Proceeding requires wiring work across core routes + dashboard UI. Please confirm you want the remaining wiring applied after reviewing this report.

