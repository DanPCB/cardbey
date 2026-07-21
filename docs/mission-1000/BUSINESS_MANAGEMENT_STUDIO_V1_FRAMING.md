# Business Management Studio V1 — Product framing (not implemented)

**Status:** Future phase — do **not** confuse with deprecated Business Import Studio.  
**Related:** `BUSINESS_STUDIO_PERFORMER_RELATIONSHIP_AUDIT.md`

## Naming

| Name | Role |
|---|---|
| Business Import Studio | **Deprecated** separate import/onboarding runway |
| Business Management Studio V1 | **Future** structured editor over existing DraftStore / Business |

## Canonical runway (unchanged)

Performer → DraftStore → StoreDraftReview → Preview → Publish

## Objective of V1

Expose structured editing for an **existing** draft or published store — not a second create/import mission owner.

## Suggested entry

- After publish: Manage business  
- Pre-publish: Edit details from StoreDraftReview (draft mode)

## Suggested path

`/app/store/:storeId/manage` (or `/app/business/:businessId/studio`)

## Non-goals

- Do not remount `/app/business-import-studio` with old semantics  
- Do not invent parallel session / catalogue / publish pipelines  
- Do not replace Performer as the primary create/import entry  

## Retained backends that may feed V1 later

- `/api/business-import-studio` (diagnostic / optional tools)  
- Business Import Kernel  
- `discoveryInputs.js`  
- DraftStore + publishDraft  

When implementing V1, open a new impact report and Phase plan; do not extend the legacy Import Studio entry route.
