# Performer Missions Audit — V1 Readiness

**Date:** 2026-06-16  
**Scope:** All missions shown in Performer Console **Quick Actions** + **More missions**  
**Method:** Codebase trace (UI → dispatch → intake V2 → skills/tools → executors). Live API smoke tests were not run in this pass; statuses reflect **implementation evidence** in `cardbey-core` + dashboard.

---

## Executive Summary

| Metric | Count |
|--------|------:|
| **Unique missions audited** | 20 |
| **Working** (end-to-end path exists, executors implemented) | 6 |
| **Partial** (runs but degraded, stubbed step, or context-dependent) | 12 |
| **Broken / placeholder** (blocker executor or no backend) | 2 |
| **V1 readiness (weighted)** | **~65%** |

### V1 Release Decision

| Option | Recommendation |
|--------|----------------|
| **GO (soft launch)** | ✅ **Yes**, if P0 missions are documented and broken chips are labeled or hidden |
| **GO (full marketing)** | ⚠️ **Hold** until P0 partials are tightened (social, C-Net, screens, card scan) |

**Rationale:** Core revenue paths (**Create store**, **Ingest document**, **Launch campaign**, **Create promotion**) have real backend pipelines. Several “More missions” chips **prefill only** and rely on classifier routing — users may hit **stub tools** or **multi-step friction** without clear feedback.

---

## Architecture (how chips become work)

```
Performer Console chip click
  → QuickActionsGrid / ConsoleCentreColumn “More missions”
  → dispatchQuickAction → unifiedDispatch → capabilitySelector
  → runtimeKernel submit_intent (performer_intake channel)
  → chipToIntent (autoSubmit: false) — composer prefill
  → User sends message
  → POST /api/performer/intake/v2
  → shortcuts → classifier → skills / skill_runtime / dispatch_tool
```

**Key files**

| Layer | Path |
|-------|------|
| Primary pills | `apps/dashboard/.../src/lib/intake/quickActionRegistry.ts` |
| More missions catalog | `apps/dashboard/.../src/app/console/missions/missionLauncher.ts` |
| UI | `apps/dashboard/.../src/app/console/ConsoleCentreColumn.tsx` |
| Intake route | `apps/core/.../src/routes/performerIntakeV2Routes.js` |
| Tool executors | `apps/core/.../src/lib/toolExecutors/index.js` |
| Legacy skills | `apps/core/.../src/lib/skills/definitions/*.js` |
| Pipeline steps | `apps/core/.../src/lib/missionPlan/intentPipelineRegistry.js` |

**Important:** Most chips do **not** auto-run missions. They prefill the composer; execution quality depends on the **next user message** + **classifier tool choice**.

---

## Mission Status Matrix

Legend: **✅ Working** · **⚠️ Partial** · **❌ Broken/Placeholder**

| # | Mission (UI label) | Pill / registry key | Backend path | UI | Trigger | Backend | Execute | Output | **Status** |
|---|-------------------|----------------------|--------------|:--:|:-------:|:-------:|:-------:|:------:|:----------:|
| 1 | Ingest business document | `ingest_document` / `ingest_business_document` | Skill `document_ingestion` | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | **⚠️ Partial** |
| 2 | Create store | `create_store` | `executeStoreMissionPipelineRun` → `structured_store_build` | ✅ | ✅ | ✅ | ✅ | ⚠️ | **✅ Working** |
| 3 | Launch campaign | `launch_campaign` | Pipeline + `launch_campaign` tool | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | **⚠️ Partial** |
| 4 | Improve this store | `improve_store` → `analyze_store` | `analyze_store` executor / store_health skill | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | **⚠️ Partial** |
| 5 | Create video | `video` / `generate_video` | Skill `video_generation` | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | **⚠️ Partial** |
| 6 | Fix issues | `fix_issues` → `diagnose_store` | **No `diagnose_store` executor** — classifier → `code_fix` / `analyze_store` / `store_health` | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | **⚠️ Partial** |
| 7 | Create mini website | `create_website` | Routed to **`create_store`** (website mode) in intake V2 | ✅ | ✅ | ✅ | ✅ | ⚠️ | **✅ Working** |
| 8 | Edit my website | `edit_website` | `edit_artifact`, `mini_website_patch_sections`, `code_fix` | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | **⚠️ Partial** |
| 9 | Generate social content | `generate_social` | `generate_social_posts` = **honestBlocker**; fallback `content_creator` | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | **❌ Broken*** |
| 10 | Deploy C-Net | `deploy_cnet` | Skill `deploy_cnet`; `deploy_to_cnet` **stub without API key** | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | **⚠️ Partial** |
| 11 | Analyze performance | `analyze_performance` | Skill `analytics_report` → `get_store_analytics` | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | **⚠️ Partial** |
| 12 | Generate tags | `generate_tags` | Skill `tag_generation` → `generate_seo_tags` | ✅ | ✅ | ✅ | ✅ | ⚠️ | **✅ Working** |
| 13 | Rewrite descriptions | `rewrite_descriptions` | Skill `content_rewrite` | ✅ | ✅ | ✅ | ✅ | ⚠️ | **✅ Working** |
| 14 | Improve hero | `improve_hero` | Skill `hero_optimization`; images via `code_fix` / `edit_artifact` | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | **⚠️ Partial** |
| 15 | Create promotion | `create_promotion` | `create_promotion` executor + campaign skill overlap | ✅ | ✅ | ✅ | ✅ | ⚠️ | **✅ Working** |
| 16 | Show this promo on my store | `show_promo_on_store` | `assign_promotion_slot` + `activate_promotion` | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | **⚠️ Partial** |
| 17 | Feature this on homepage | `feature_on_homepage` | Skill `homepage_feature` | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | **⚠️ Partial** |
| 18 | Push this to screens | `push_to_screens` | Pipeline tools **all blockers**; use `signage.publish-to-devices` | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | **⚠️ Partial** |
| 19 | Setup loyalty campaign | `setup_loyalty` | Skill `loyalty_campaign` / runtime `setup_loyalty_program` | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | **⚠️ Partial** |
| 20 | Scan card to create product | `scan_card_create` | Skill `card_scan`; OCR steps **stub** | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | **❌ Broken** |

\* *Generate social content* is **Broken** if classifier picks `generate_social_posts`; **Partial** if it picks `content_creator` (not guaranteed from chip prefill alone).

**Duplicates in UI:** Ingest document and Create video appear in both Quick Actions and More missions (same prefill).

---

## Detailed Findings

### ✅ Working (high confidence)

| Mission | Backend | Notes | Confidence |
|---------|---------|-------|:----------:|
| **Create store** | `executeStoreMissionPipelineRun.js`, `structured_store_build` | Primary V1 runway; checkpoints + draft build | High |
| **Create mini website** | Same pipeline, website intent mode (`create_mini_website` → `create_store`) | Consolidated in intake V2 | High |
| **Create promotion** | `toolExecutors/promotion/create_promotion.js` | Needs store/promo context | High |
| **Generate tags** | `tag_generation` skill → `generate_seo_tags` | Needs catalog/content | Medium–High |
| **Rewrite descriptions** | `content_rewrite` skill | Needs existing product copy | Medium–High |
| **Ingest business document** | `document_ingestion` skill chain | Quality depends on file/OCR | Medium |

### ⚠️ Partially Working

| Mission | Issues | Severity |
|---------|--------|:--------:|
| **Launch campaign** | Long pipeline (research → consensus → promotion → CRM); some steps need store + confirmation; guest-gated | **P1** |
| **Improve this store** | `analyze_store` returns analysis/suggestions, not automatic fixes | **P2** |
| **Create video** | `queue_video_generation` stubs without `VIDEO_API_KEY` / provider | **P1** |
| **Fix issues** | Dispatch type `diagnose_store` has **no executor**; outcome depends on classifier (inconsistent) | **P0** |
| **Edit my website** | Requires existing draft; split across `edit_artifact` / `code_fix` | **P2** |
| **Deploy C-Net** | Honest stub when `CNET_API_KEY` missing (staging often degraded) | **P1** |
| **Analyze performance** | Empty analytics if new store / no traffic | **P2** |
| **Improve hero** | Text vs image paths differ; image may need stock search + approval | **P2** |
| **Show promo on store** | Needs promo artifact + slot assignment context | **P2** |
| **Feature on homepage** | Admin/feed constraints; may need platform config | **P2** |
| **Push to screens** | Legacy pipeline blockers; real path is `signage.publish-to-devices` (needs paired device) | **P1** |
| **Setup loyalty campaign** | `schedule_loyalty_campaign` partial stub in tests | **P2** |

### ❌ Broken / Placeholder

| Mission | Issue | Severity |
|---------|-------|:--------:|
| **Generate social content** | `generate_social_posts` registered but **`honestBlocker`** in `toolExecutors/index.js` | **P0** |
| **Scan card to create product** | `extract_card_data` / `create_product_from_card` stub without OCR bridge | **P1** |

### Screen deployment pipeline (related)

These tools are in `intentPipelineRegistry` but **all blocked** in executors:

- `resolve_target_screens`
- `prepare_screen_asset`
- `assign_screen_slot`
- `activate_screen_content`

**Working alternative:** `signage.list-devices`, `signage.publish-to-devices` (requires C-Net/device pairing).

---

## Capability Mapping (UI → dispatch → backend)

### Quick Actions (primary)

| Mission | Dispatch `type` | Tool / pipeline | Skill trigger (if any) |
|---------|-----------------|-------------------|-------------------------|
| Ingest business document | `ingest_document` | `document_ingestion` | ✅ |
| Create store | `create_store` | Store mission pipeline | — |
| Launch campaign | `launch_campaign` | `launch_campaign` + pipeline | `campaign` |
| Improve this store | `analyze_store` | `analyze_store` | `store_health` / analytics |
| Create video | `generate_video` | — | `video_generation` |
| Fix issues | `diagnose_store` | **Classifier-dependent** | `store_health`, `code_fix` |

### More missions (prefill → intake classifier)

| Mission | Pill ID | Typical classifier / skill |
|---------|---------|----------------------------|
| Create mini website | `create_website` | → `create_store` (website mode) |
| Edit my website | `edit_website` | `edit_artifact`, `code_fix` |
| Generate social content | `generate_social` | `generate_social_posts` ❌ or `content_creator` |
| Deploy C-Net | `deploy_cnet` | `deploy_cnet` skill |
| Analyze performance | `analyze_performance` | `analytics_report` |
| Generate tags | `generate_tags` | `tag_generation` |
| Rewrite descriptions | `rewrite_descriptions` | `content_rewrite` |
| Improve hero | `improve_hero` | `hero_optimization` |
| Create promotion | `create_promotion` | `create_promotion` |
| Show this promo on my store | `show_promo_on_store` | `assign_promotion_slot` |
| Feature this on homepage | `feature_on_homepage` | `homepage_feature` |
| Push this to screens | `push_to_screens` | `smart_display_publish` (stub push) / signage tools |
| Setup loyalty campaign | `setup_loyalty` | `loyalty_campaign` |
| Scan card to create product | `scan_card_create` | `card_scan` (stub OCR) |

---

## Known System Gaps (cross-cutting)

| Gap | Impact | Missions affected |
|-----|--------|-------------------|
| **Prefill-only chips** (`autoSubmit: false`) | User must send second message; feels “broken” if they expect one-click | All 20 |
| **`diagnose_store` not in tool registry** | “Fix issues” has no stable backend mapping | Fix issues |
| **`generate_social_posts` blocker** | Social chip misleading | Generate social content |
| **Screen pipeline blockers** | “Push to screens” copy promises more than executor delivers | Push to screens |
| **C-Net / OCR / video provider env** | Staging/live degraded without keys | Deploy C-Net, Create video, Scan card |
| **Three skill systems** (`lib/skills`, `skill_runtime`, `services/skills`) | Routing ambiguity, duplicate paths | Many |
| **Guest gating** | Campaign/promo redirects to login | Launch campaign, Create promotion |
| **Store context required** | Toast if no store bound | Improve, Analyze, many More missions |

---

## Recommendations

| Priority | Action | Effort | Missions |
|:--------:|--------|--------|----------|
| **P0** | Map **Fix issues** chip to explicit tool (`code_fix` + `audit_store_completeness` plan) instead of `diagnose_store` phantom type | S | Fix issues |
| **P0** | **Generate social:** route chip/classifier to `content_creator` OR implement `generate_social_posts`; hide chip until fixed | M | Generate social content |
| **P0** | Add **“Coming soon” / env badge** on Deploy C-Net, Scan card, Push to screens when stubs detected | S | C-Net, Card scan, Screens |
| **P1** | Wire **Push to screens** chip → `signage.publish-to-devices` with device picker UX | M | Push to screens |
| **P1** | Document **VIDEO_API_KEY** requirement for Create video; show honest empty state | S | Create video |
| **P1** | Launch campaign: reduce pipeline steps for V1 “happy path” (promotion + activate only) | L | Launch campaign |
| **P2** | Merge duplicate **Ingest** / **Create video** entries in More missions list | S | UX |
| **P2** | Offer workflow capabilities marked “planner only” in `capabilityCatalog.ts` — align UI labels | M | Create promotion variants |

---

## Verification Checklist (code audit)

| Mission | UI | Trigger | Backend | Execution | Output | Status |
|---------|:--:|:-------:|:-------:|:-----------:|:------:|:------:|
| Ingest business document | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Partial |
| Create store | ✅ | ✅ | ✅ | ✅ | ⚠️ | Working |
| Launch campaign | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Partial |
| Improve this store | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Partial |
| Create video | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Partial |
| Fix issues | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | Partial |
| Create mini website | ✅ | ✅ | ✅ | ✅ | ⚠️ | Working |
| Edit my website | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Partial |
| Generate social content | ✅ | ✅ | ❌ | ❌ | ❌ | Broken |
| Deploy C-Net | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | Partial |
| Analyze performance | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Partial |
| Generate tags | ✅ | ✅ | ✅ | ✅ | ⚠️ | Working |
| Rewrite descriptions | ✅ | ✅ | ✅ | ✅ | ⚠️ | Working |
| Improve hero | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Partial |
| Create promotion | ✅ | ✅ | ✅ | ✅ | ⚠️ | Working |
| Show this promo on my store | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Partial |
| Feature this on homepage | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Partial |
| Push this to screens | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | Partial |
| Setup loyalty campaign | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Partial |
| Scan card to create product | ✅ | ✅ | ⚠️ | ❌ | ❌ | Broken |

---

## Suggested Live Smoke Test (staging)

Run as platform admin with a test store bound:

```bash
# Replace TOKEN and adjust text to match missionLauncher prefill strings
for TEXT in \
  "Ingest business document" \
  "Create a store for my business" \
  "Launch a marketing campaign" \
  "Find and fix issues with my store, catalog, and checkout experience" \
  "Generate social content for my store" \
  "Deploy C-Net for my store"
do
  curl -sS -X POST "https://cardbey-core-staging.onrender.com/api/performer/intake/v2" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"message\":\"$TEXT\",\"source\":\"performer\"}" | jq '{text: "'"$TEXT"'", tool: .tool, ok: .ok, error: .error}'
done
```

Compare `tool` / `executionPath` in responses to the mapping tables above.

---

## V1 Readiness Assessment

| Category | Ready? | Notes |
|----------|:------:|-------|
| **Store creation runway** | ✅ | Core differentiator; keep front-and-center |
| **Document ingest → catalog** | ✅ | Monitor OCR quality |
| **Campaign / promotion** | ⚠️ | Works with friction; simplify messaging |
| **Creative (video, social)** | ❌/⚠️ | Social broken; video provider-dependent |
| **Signage / C-Net** | ⚠️ | Environment + stub honesty required |
| **Optimization (tags, rewrite, hero)** | ✅ | Best “More missions” value |
| **Diagnostics (fix / analyze)** | ⚠️ | Rename and wire Fix issues explicitly |

**Overall V1 readiness: ~65%** — sufficient for controlled beta if P0 UX honesty fixes ship with release notes.

---

## Related docs

- `docs/LANGUAGE_SELF_FIXING_PHASE1.md` — separate i18n tooling (not performer missions)
- `apps/dashboard/.../src/app/console/missions/missionLauncher.ts` — pill catalog source of truth
- `apps/core/.../src/lib/toolExecutors/index.js` — executor honesty blockers
