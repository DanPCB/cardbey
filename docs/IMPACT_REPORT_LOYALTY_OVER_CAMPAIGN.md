# Impact Report: Loyalty wins over "loyalty campaign"

**Date:** 2026-07-09  
**Scope:** Route `"create a loyalty campaign…"` to `setup_loyalty_program`, not `create_campaign`.

## Problem

Phrase `"create a loyalty campaign for my store with this card"` matches campaign patterns (`create … campaign`, `campaign for`) but **not** `isLoyaltyIntent` (no `loyalty program` / adjacent `loyalty card`). Result: `tool=create_campaign` → poster/slideshow assets.

## What could break

| Risk | Why | Scope |
|------|-----|--------|
| Explicit marketing of loyalty | Broader loyalty patterns could steal poster/social intents | Campaign launch when advertising a loyalty offer |
| Campaign phrase coverage | Skipping campaign when loyalty terms present | Pure marketing campaigns that casually mention "loyalty" |

## Smallest safe patch

1. Expand `LOYALTY_PATTERNS` / add `loyalty campaign`, stamp/reward/punch card, digital loyalty.
2. Add `isExplicitLoyaltyMarketingCampaign` exception (poster / social / marketing campaign advertising loyalty).
3. In IntentReasoner: if loyalty detected and not explicit marketing → do not push `create_campaign` (or push with lower conf). Early loyalty return optional; prefer skip-campaign.
4. Intake safety override: `create_campaign` + loyalty text/attachment → `setup_loyalty_program` + telemetry `loyalty_overrode_campaign`.
5. Regression tests for phrases in the fix brief.

## Out of scope

- Changing campaign asset pipeline itself
- Deleting campaign detectors
