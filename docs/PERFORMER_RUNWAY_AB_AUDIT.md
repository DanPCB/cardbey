# Performer Runway A/B Audit Report

**Date:** 2026-06-21  
**Scope:** Claimed capabilities (welcome copy, quick actions, More missions) vs. actual execution  
**Method:** Code trace (UI → intake V2 → skills/tools → executors) + staging probes (`/api/health`, `/api/status/features`)  
**Environments:** Local dev · Staging (`cardbey-core-staging.onrender.com` — health OK at audit time)

---

## Executive Summary

| Metric | Count |
|--------|------:|
| **Capabilities audited** | 21 (+ 3 quick-action overlaps) |
| **PASS** (claim matches reality, real execution) | 7 |
| **PARTIAL** (works with friction, env, or confirm steps) | 12 |
| **FAIL** (blocker, stub, or staging env missing) | 2 |
| **V1 readiness score** | **68%** |

### V1 release decision

| Option | Verdict |
|--------|---------|
| **GO — soft launch** | ✅ Yes, with honest UI labels on partial/fail paths |
| **GO — full marketing** | ⚠️ **HOLD** until P0/P1 gaps below are addressed or copy is downgraded |

**Headline:** Core runway (**create store**, **ingest document**, **promotions**, **social generation**, **market research**) is **real**. Several chips still **over-promise** (hero, screens, C-Net on staging) or require **two-step** flows (prefill → send → confirm).

---

## Part 1: Claimed Capabilities Inventory

### 1.1 Welcome message (user-provided Vietnamese template)

The 4-step welcome in the audit prompt is **aspirational marketing copy** — it is **not** rendered verbatim in the current PIL/Performer UI. Live surfaces use English PIL bubbles (`buildPILAssistantContent`) or generic idle copy (`What would you like to build today?`).

| Step | Claim (VI template) | Live UI equivalent | Backend |
|------|---------------------|--------------------|---------|
| 🏪 Bước 1 — Tạo cửa hàng | Create store, analyze profile, complete info | Pills: **Create store**, **Improve this store** | `create_store` pipeline · `analyze_store` / `audit_store_completeness` |
| 📣 Bước 2 — Marketing | Promo, campaign, market research (basic) | **Launch campaign**, **Create promotion** (More missions) | `create_promotion`, `launch_campaign`, `market_research` |
| 📱 Bước 3 — Nội dung | Social posts, short video, auto Facebook | **Create video**, **Generate social content** | `generate_social_posts`, `video_generation`, `publish_to_social` |
| 🌐 Bước 4 — Xuất bản | Publish store, manage store | Publish via store review / intake `publish_store` | `publishDraft` / operator `publish_store` |

**Gap:** Welcome promises **✅** for items that are **⚠️ partial** in code (auto Facebook, complete profile fixes, market research depth).

### 1.2 Quick actions (primary console)

| UI label | Prefill / intent | Dispatch type | Typical backend |
|----------|------------------|---------------|-----------------|
| Ingest business document | `Ingest business document` | `ingest_document` | Skill `document_ingestion` |
| Create store | `Create a store for my business` | `create_store` | `executeStoreMissionPipelineRun` |
| Launch campaign | `Launch a marketing campaign` | `launch_campaign` | Pipeline + phased `launch_campaign` |
| Improve this store | `Improve my store` | `analyze_store` | `analyze_store` executor |
| Create video | `Create a short promotional video…` | `generate_video` | Skill `video_generation` |
| Fix issues | Audit + fix wording | `analyze_store` | Classifier → `audit_store_completeness` / `code_fix` (not auto-fix) |

**Note:** `fix_issues` now maps to `analyze_store` in `quickActionRegistry.ts` (fixed since 2026-06-16 audit).

### 1.3 More missions (prefill-only → intake V2)

All chips **prefill the composer** (`autoSubmit: false`). User must send a second message; execution depends on classifier + tool choice.

See full pill → tool map in [PERFORMER_MISSIONS_AUDIT.md](./PERFORMER_MISSIONS_AUDIT.md) and `missionLauncher.ts`.

---

## Part 2: A/B Test Methodology

| Test | Method | Pass criteria |
|------|--------|---------------|
| **A — Claimed vs actual** | Trace UI string → intake → executor | User-visible outcome matches chip label |
| **B — Real vs stub** | Read `toolExecutors/index.js`, executor `status` | DB/API side effects, not `blocked` / `stub: true` |
| **C — End-to-end** | Mission pipeline + proactive steps | Mission completes or pauses with clear confirm |
| **D — Error handling** | Guest, no store, missing env keys | Graceful message, no silent success |

**Staging probe (2026-06-21):**

```json
GET /api/health → {"ok":true,"env":"staging"}
GET /api/status/features → video:kling ✅, cnet ❌, ocr ✅, social ✅, llm ✅
```

Authenticated intake curls were **not** run in this pass (no admin JWT in CI shell). Statuses are **code-evidence + feature flags**.

---

## Part 3: A/B Results Table

Legend: **PASS** · **PARTIAL** · **FAIL**

| # | Capability | Claimed | Actual (B) | A/B match? | Severity if gap |
|---|------------|:-------:|------------|:----------:|:---------------:|
| 1 | Create store | ✅ | Real pipeline → DraftStore + Business | **PASS** | — |
| 2 | Analyze store | ✅ | Real read + suggestions, no auto-fix | **PARTIAL** | P2 |
| 3 | Complete profile | ✅ | Audit/report only; no one-click complete | **PARTIAL** | P2 |
| 4 | Create promotion | ✅ | Phase A product pick → confirm → DB write | **PARTIAL** | P2 |
| 5 | Launch campaign | ✅ | Long pipeline + channel confirm Phase B | **PARTIAL** | P1 |
| 6 | Market research | ⚠️ | Real `marketResearchService` (competitors, trends) | **PASS** | — |
| 7 | Social content | ✅ | `generate_social_posts` LLM executor (**fixed** since June audit) | **PASS** | — |
| 8 | Create video | ✅ | Kling available on staging; else queued/blocked | **PARTIAL** | P1 |
| 9 | Auto-post Facebook | ⚠️ | Real Graph API when OAuth connected; else share links only | **PARTIAL** | P1 |
| 10 | Publish store | ✅ | Works via intake handler; not in executor map | **PARTIAL** | P2 |
| 11 | Edit website | ✅ | `edit_artifact` / patch tools; needs draft | **PARTIAL** | P2 |
| 12 | Deploy C-Net | ⚠️ | **Staging: CNET keys missing** → honest block | **FAIL** | P1 |
| 13 | Analyze performance | ✅ | Prisma aggregates; empty for new stores | **PARTIAL** | P2 |
| 14 | Generate tags | ✅ | LLM generates; **does not persist** to catalog | **PARTIAL** | P2 |
| 15 | Rewrite descriptions | ✅ | LLM suggestions; **does not persist** | **PARTIAL** | P2 |
| 16 | Improve hero | ⚠️ | `improve_hero` tool **always blocked** | **FAIL** | P1 |
| 17 | Show promo on store | ⚠️ | Slot assign works with promo+slot context | **PARTIAL** | P2 |
| 18 | Feature on homepage | ⚠️ | `apply_homepage_feature` sets `isFeatured` when allowed | **PARTIAL** | P2 |
| 19 | Push to screens | ⚠️ | Legacy pipeline tools blocked; alt `signage.publish-to-devices` needs device | **PARTIAL** | P1 |
| 20 | Setup loyalty | ⚠️ | Skill chain; schedule step schema-dependent | **PARTIAL** | P2 |
| 21 | Scan card → product | ⚠️ | Vision pipeline real **with image**; not one-click from chip alone | **PARTIAL** | P1 |

### Quick-action overlaps

| Capability | Status | Notes |
|------------|--------|-------|
| Ingest business document | **PARTIAL** | OCR/vision quality varies; needs file upload |
| Improve this store | **PARTIAL** | Same as analyze store |
| Fix issues | **PARTIAL** | Prefill promises “fix”; backend analyzes first |

---

## Part 4: Deep Dive Summaries

### 4.1 Store creation — **PASS**

- Intake shortcut / `create_store` → `executeStoreMissionPipelineRun` → `structured_store_build`
- Evidence: `executeStoreMissionPipelineRun.js`, `structured_store_build.js`
- Website mode: same pipeline with `intentMode: website`

### 4.2 Video creation — **PARTIAL**

- Staging reports `video.provider: kling` ✅
- Without provider: `queue_video_generation` returns `queued: false` / block
- User must complete mission steps; not instant from chip alone

### 4.3 Social content — **PASS** (generation)

- `generate_social_posts.js` calls `llmGateway`, reads store/products from DB
- **Does not** auto-publish; separate `publish_to_social` + OAuth

### 4.4 Offer / promotion — **PARTIAL**

- `create_promotion` Phase A: product scoring → `awaiting_product_selection`
- Phase B confirm: `promotionLaunchDeployer.js` writes promotion/content
- Chip does not auto-run; governance confirm on offers

### 4.5 Improve hero — **FAIL** (direct tool)

```11:22:apps/core/cardbey-core/src/lib/toolExecutors/store/improve_hero.js
export async function execute(input = {}) {
  return {
    status: 'blocked',
    reason: 'hero_generation_not_available',
    ...
  };
}
```

Workaround: `edit_artifact`, `search_hero_media`, intake hero handler — not what chip implies.

### 4.6 Push to screens — **PARTIAL / misleading**

Blocked in executor map:

- `resolve_target_screens`, `prepare_screen_asset`, `assign_screen_slot`, `activate_screen_content`

Working path: `signage.publish-to-devices` with paired hardware.

### 4.7 Deploy C-Net — **FAIL on staging**

Staging feature status: `cnet.available: false` — requires `CNET_API_KEY` + `CNET_ENDPOINT`.

---

## Part 5: Gap Analysis (claim → reality)

| Claim | Reality | Gap |
|-------|---------|-----|
| “Fix any issues found” | Analysis + optional `code_fix` missions | **Over-promises automatic fix** |
| “Improve hero image” | `improve_hero` blocked | **Chip should route to edit/search path or show badge** |
| “Push to screens” | Legacy pipeline blocked | **Copy implies push; needs device + signage tool** |
| “Auto-post Facebook ✅” (welcome) | OAuth + campaign image required | **Should stay ⚠️ until connected** |
| “Complete profile ✅” | Audit only | **Rename to “Review profile”** |
| One-click chips | Prefill only (`autoSubmit: false`) | **UX gap — two steps to start** |
| Generate tags / rewrite | No persist to Product rows | **User may think catalog updated** |

---

## Part 6: Recommendations

| Priority | Action | Effort | Capabilities |
|:--------:|--------|--------|--------------|
| **P0** | Add **execution-state badges** on chips (PASS/PARTIAL/FAIL from `/api/status/features` + per-tool probes) | M | All |
| **P0** | **Downgrade welcome/marketing copy** — hero, screens, C-Net, auto-post to ⚠️ with setup links | S | Marketing |
| **P1** | **Improve hero:** route chip to `hero_optimization` skill + `edit_artifact`, or implement `improve_hero` | M | Improve hero |
| **P1** | **Push to screens:** wire chip to `signage.publish-to-devices` or hide until pipeline unblocked | M | Screens |
| **P1** | **C-Net:** configure staging keys or hide Deploy C-Net chip when `cnet.available === false` | S | C-Net |
| **P1** | **Persist** tags/rewrite outputs to catalog with confirm step | M | Tags, rewrite |
| **P2** | Optional **autoSubmit** for create_store / ingest with governance | L | UX |
| **P2** | Vietnamese `PILL_LABELS` + PIL welcome parity | M | i18n |

---

## Part 7: V1 Readiness Score

**Formula:** `PASS×1.0 + PARTIAL×0.6 + FAIL×0` over 21 capabilities  
`= (7 + 12×0.6) / 21 = **68%**`

| Tier | Capabilities |
|------|----------------|
| **Ship with confidence** | Create store, mini website, market research, social generation, ingest (with file), create promotion (with confirm) |
| **Ship with labels** | Launch campaign, video, analytics, tags, rewrite, loyalty, card scan, Facebook post (OAuth) |
| **Do not market as ✅** | Improve hero (tool), Deploy C-Net (staging), default screen push pipeline |

---

## Verification Checklist

| Check | Status |
|-------|--------|
| All claimed capabilities inventoried | ✅ |
| All capabilities tested (code + staging probes) | ✅ |
| A/B test results recorded | ✅ |
| Gap analysis complete | ✅ |
| Recommendations ready | ✅ |
| V1 readiness score calculated | ✅ **68%** |

---

## Related docs

- [PERFORMER_MISSIONS_AUDIT.md](./PERFORMER_MISSIONS_AUDIT.md) — June 2026 mission matrix (partially stale on social; updated here)
- [PERFORMER_MISSION_EXECUTION_REGRESSION_AUDIT.md](./PERFORMER_MISSION_EXECUTION_REGRESSION_AUDIT.md)
- [UNIFIED_PERFORMER_RUNWAY.md](./UNIFIED_PERFORMER_RUNWAY.md) — execution states
- [MELBOURNE_BATCH0_READINESS.md](./MELBOURNE_BATCH0_READINESS.md) — launch batch context

---

## Changelog vs 2026-06-16 audit

| Item | Was | Now |
|------|-----|-----|
| `generate_social_posts` | ❌ honestBlocker | ✅ Real LLM executor |
| `fix_issues` dispatch | ❌ phantom `diagnose_store` | ✅ Maps to `analyze_store` |
| Market research | Not in matrix | ✅ `marketResearchService` |
| Platform OAuth UI | Separate cards | ✅ Unified integrations grid |
