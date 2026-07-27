# External Capability Integration Readiness Audit

**Date:** 2026-06-19  
**Scope:** Cardbey monorepo — `cardbey-core` runtime, Performer intake, dashboard UX, planned external providers  
**Method:** Codebase trace (executors, adapters, agents, skills, health APIs, env contracts). Complements [PERFORMER_MISSIONS_AUDIT.md](./PERFORMER_MISSIONS_AUDIT.md) and [V1_SOFT_LAUNCH.md](./V1_SOFT_LAUNCH.md).

---

## Executive Summary

| Question | Answer |
|----------|--------|
| **Can Cardbey integrate external APIs today?** | **Yes, incrementally** — via `toolExecutors`, domain adapters, and `llmGateway`; no unified “external capability registry” yet |
| **Overall readiness (0–10)** | **6.2 / 10** — strong execution seam, weak provider governance & marketplace layer |
| **Ready for Week-1 provider adds?** | **Yes** — image (Sharp/Cloudinary), translation (DeepL), TTS can follow existing adapter patterns |
| **Ready for community marketplace / agent swarms?** | **Not yet** — missing SDK, validation, versioning, billing aggregation |

### Go / No-Go

| Track | Decision |
|-------|----------|
| **Integrate 3–5 SaaS providers behind existing tools** | ✅ **GO** |
| **Open community skill marketplace** | ⛔ **HOLD** (4–8 weeks infra) |
| **Self-learning / outcome-driven routing** | ⚠️ **PARTIAL** — PIL + episodic memory exist; no closed-loop learner |

---

## Part 1: Current Capabilities Audit

### 1.1 Core Capabilities (Build In-House)

| Capability | Status | Implementation | Working? | Notes |
|------------|--------|------------------|:--------:|-------|
| Store creation | ✅ | `executeStoreMissionPipelineRun` → `structured_store_build` | ✅ | Intake V2 shortcut + pipeline |
| Document ingestion | ⚠️ | Skill `document_ingestion` / `scan_document` | ⚠️ | OCR + extract; quality varies by image |
| Store analysis | ✅ | `analyze_store`, skill `store_health` | ✅ | Findings + suggestions |
| Promotion creation | ✅ | `create_promotion`, `create_offer_draft` | ✅ | `create_offer` still honestBlocker |
| Tag generation | ✅ | `generate_tags` / skill `tag_generation` | ✅ | LLM via gateway |
| Description rewrite | ✅ | `rewrite_descriptions` / skill `content_rewrite` | ✅ | |
| Social content | ✅ | `generate_social_posts` (post-P0) | ✅ | LLM; was honestBlocker |
| Fix issues | ✅ | `audit_store_completeness` + `generate_health_report` (post-P0) | ✅ | Was `diagnose_store` gap |
| Mini website | ✅ | `create_store` website mode | ✅ | Same pipeline as store |
| Scan card → product | ⚠️ | `/api/vision/scan` + `extract_card_data` | ⚠️ | Needs vision API keys; confirm flow |

**Evidence:** `apps/core/cardbey-core/src/lib/toolExecutors/index.js`, `src/lib/storeMission/executeStoreMissionPipelineRun.js`, `src/routes/visionIntake.js`.

### 1.2 Agent Capabilities (P5)

| Agent | Status | Capabilities | Working? | Notes |
|-------|--------|--------------|:--------:|-------|
| Analytics Agent | ✅ Registered | analyze, forecast, insights | ⚠️ | Maps to skill `analyze_store`; runtime registry only |
| Creative Agent | ✅ Registered | generate, design, create | ⚠️ | skillId `generate_content` — verify skill exists at runtime |
| Optimizer Agent | ✅ Registered | optimize, adjust, improve | ⚠️ | skillId `create_campaign` |
| Concierge Agent | ✅ Registered | support, recommend, assist | ⚠️ | skillId `analyze_store_fallback` |

**Evidence:** `apps/core/cardbey-core/src/services/agents/builtinAgents.js`, `agentRegistry.js`.

**Gap:** Two agent registries — runtime (`services/agents/`) vs LLM personas (`lib/agents/agentRegistry.js`). P5 agents are **config + discovery**, not autonomous swarms.

### 1.3 External / Provider-Backed Capabilities (Current)

| Capability | Status | Provider(s) in code | Integration | Working? |
|------------|--------|---------------------|-------------|:--------:|
| LLM reasoning | ✅ | OpenAI, Anthropic, xAI, Groq*, DeepSeek* | `llmGateway.ts`, `hybridRouter.js` | ✅ |
| Video generation | ⚠️ | Kling, OpenAI, mock | `videoProvider.js`, `videoGenerate.js` | ⚠️ Env-gated |
| OCR / scan | ✅ | OpenAI Vision, Anthropic fallback, Google Vision* | `runOcr.js`, `ocrFallback.js` | ⚠️ Keys required |
| Hero/media search | ⚠️ | Pexels, Pixabay, Coverr, Mixkit | `*Adapter.js` in `services/media/` | ⚠️ Per-key skip |
| Logo search | ⚠️ | Clearbit, Brandfetch | `services/logo/` | ⚠️ |
| Storage | ✅ | Local, S3/R2 | `lib/storage/` | ✅ |
| Translation (agent) | ⚠️ | Anthropic direct | `translateString.js` | ⚠️ Not DeepL/Google |
| C-Net deploy | ⚠️ | Custom API | `deploy_to_cnet.js` | ❌ Without `CNET_*` keys |
| Google Calendar | ⚠️ | Google OAuth | `mcp_google_calendar_create_event.js` | ⚠️ OAuth path |
| MCP context reads | ✅ | Internal DB adapters | `lib/mcp/adapters/*` | ✅ Read-only |

\* Optional / parallel routing paths.

### 1.4 Honest Blockers (Not Ready)

| Tool | Message |
|------|---------|
| `generate_promotion_asset` | Not implemented |
| `resolve_target_screens` … `activate_screen_content` | Screen pipeline stubs (4 tools) |
| `create_offer` | Use `create_offer_draft` |
| `smart_visual` | Use `search_hero_media` / `edit_artifact` |

**Evidence:** `toolExecutors/index.js` — 7 `honestBlocker` entries.

---

## Part 2: Architecture Readiness Audit

### 2.1 Integration Spine

```
User / Performer Console
  → unifiedDispatch (dashboard)
  → POST /api/performer/intake/v2
  → classifier + skills + dispatchTool()
  → toolExecutors[toolName].execute()
  → domain module / external API / MCP adapter
```

**Key integration files**

| Layer | Path |
|-------|------|
| Dispatch | `src/lib/toolDispatcher.js` |
| Executor registry | `src/lib/toolExecutors/index.js` |
| Intake tools | `src/lib/intake/intakeToolRegistry.js` |
| Capabilities (declarative) | `src/lib/capabilities/capabilityRegistry.js` |
| Skills (composable) | `src/services/skills/skillRegistry.js` |
| Skills (performer) | `src/lib/skills/SkillRegistry.js` |
| MCP adapters | `src/lib/mcp/registerDefaultAdapters.js` |
| LLM gateway | `src/lib/llm/llmGateway.ts` |
| Feature flags (UI) | `GET /api/status/features` |

### 2.2 Runtime Kernel Readiness

| Feature | Status | Notes |
|---------|:--------:|-------|
| Can dispatch to external services | ✅ | Via tool executors calling fetch/SDK |
| Can handle external responses | ✅ | Normalized `{ status, output, error }` |
| Can retry on external failure | ⚠️ | Skill `compositionEngine` retries steps; **not** in `toolDispatcher` |
| Can fallback on external failure | ⚠️ | LLM model fallback, OCR fallback, declarative `fallbackTools` in capability registry (planning only) |
| Can track external costs | ⚠️ | `LlmUsageDaily` for LLM; no unified non-LLM cost ledger |
| Honest failure (no fake success) | ✅ | `honestBlocker` + truth enforcer pre-commit |
| Governance / confirm before publish | ✅ | Safe execution governance, intake approval cards |

### 2.3 Memory & Context

| Feature | Status | Notes |
|---------|:--------:|-------|
| Store external service preferences | ❌ | No tenant provider prefs table |
| Track external usage | ⚠️ | LLM daily usage only |
| Learn from external outcomes | ⚠️ | PIL attention graph + episodic memory; no outcome-weighted provider routing |
| MCP context for tools | ✅ | Products, business, promotions, missions, analytics |

### 2.4 Dashboard Integration Readiness

| Feature | Status | Notes |
|---------|:--------:|-------|
| Feature availability badges | ✅ | `useFeatureStatus` → `/api/status/features` |
| Explore → Performer handoff | ✅ | `exploreCapabilityRegistry.ts` |
| Quick actions / missions catalog | ✅ | 8 dispatch actions + 17 pill prefills |
| Marketplace UI (skills) | ❌ | Contents Studio templates only |
| Provider picker UI | ❌ | |

---

## Part 3: External Provider Assessment

Legend: **Integrated** = code path exists · **Planned** = no executor · **Effort** = net new adapter work

### 3.1 Video Editing

| Provider | In codebase | Cost (typical) | Effort | Status |
|----------|-------------|----------------|--------|--------|
| Kling | ✅ | Usage-based | — | **Integrated** |
| OpenAI Video | ✅ | Usage-based | — | **Integrated** |
| Replicate | ❌ | ~$0.01–0.10/req | Low | Planned |
| FFmpeg (OSS) | ❌ | Free | High | Planned |

### 3.2 Image Editing

| Provider | In codebase | Cost | Effort | Status |
|----------|-------------|------|--------|--------|
| Sharp (OSS) | ⚠️ Possible via Node | Free | Low | Not wired as tool |
| Cloudinary | ❌ | Free tier | Low | Planned — fits storage/media pattern |
| Replicate | ❌ | Low | Low | Planned |
| Pexels/Pixabay | ✅ Search only | Free/API key | — | **Integrated** (search, not edit) |

### 3.3 Translation

| Provider | In codebase | Cost | Effort | Status |
|----------|-------------|------|--------|--------|
| Anthropic (LLM) | ✅ | Token-based | — | **Integrated** (`translateString`) |
| DeepL | ❌ | ~$0.01/req | Low | Planned |
| Google Translate | ❌ | Low | Low | Planned |
| LibreTranslate | ❌ | Free (self-host) | Medium | Planned |

### 3.4 TTS / Voice

| Provider | In codebase | Cost | Effort | Status |
|----------|-------------|------|--------|--------|
| ElevenLabs | ❌ | ~$5/mo+ | Low | Planned |
| Google TTS | ❌ | Low | Low | Planned |
| OpenAI TTS | ❌ | Low | Low | Planned (same gateway pattern) |
| Piper / Coqui | ❌ | Free | Medium | Planned |

### 3.5 Slideshow

| Provider | In codebase | Cost | Effort | Status |
|----------|-------------|------|--------|--------|
| Internal `generate_slideshow` | ✅ | LLM + assets | — | **Partial** |
| Canva API | ❌ | Paid | Medium | Planned |
| Replicate | ❌ | Low | Low | Planned |
| Puppeteer (OSS) | ❌ | Free | High | Planned |

### 3.6 OCR (Audit correction)

| Provider | In codebase | Status |
|----------|-------------|--------|
| OpenAI Vision | ✅ Primary | **Integrated** |
| Anthropic Vision | ✅ Fallback | **Integrated** |
| Google Cloud Vision | ✅ Opt-in fallback | **Integrated** |
| Tesseract | ❌ | **Not used** — spec Phase 1 Tesseract superseded by vision API stack |

---

## Part 4: Gap Analysis

### 4.1 Missing Infrastructure

| Gap | Severity | Fix effort | Priority |
|-----|----------|------------|----------|
| Unified **external provider registry** (id, env keys, health, cost) | High | 2–3 days | **P0** |
| **Non-LLM cost tracking** (video, OCR, TTS per tenant) | High | 2 days | **P0** |
| **Provider health checks** in `/api/status/features` | Medium | 1 day | **P1** |
| Automatic provider selection / routing | Medium | 3–5 days | **P1** |
| Secret management UI (not just env) | Medium | 1 week | **P2** |
| Dispatcher-level retry with backoff | Medium | 1–2 days | **P1** |
| Consolidate dual LLM budget paths (`llmGateway` vs `llmBudget`) | Medium | 1 day | **P1** |
| `.env.example` completeness for media/video/storage | Low | 2h | **P1** |

### 4.2 Missing Developer Tooling

| Gap | Severity | Fix effort | Priority |
|-----|----------|------------|----------|
| Community **skill SDK** | High | 1–2 weeks | **P2** |
| Skill **marketplace UI** | High | 2 weeks | **P2** |
| Skill validation / sandbox | High | 1 week | **P2** |
| Skill versioning + semver enforcement | Medium | 3–5 days | **P2** |
| External capability **plugin contract** (manifest + executor) | High | 1 week | **P1** |

### 4.3 Registry Fragmentation (Architectural Debt)

| Registry | Location | Risk |
|----------|----------|------|
| `toolRegistry.js` | Legacy broad list | Drift from intake registry |
| `intakeToolRegistry.js` | Classifier source of truth | Good for intake |
| `capabilityRegistry.js` | Declarative fallbacks | References blocked tools |
| 3× skill registries | performer / composable / skill_runtime | Duplicate definitions |
| 2× agent registries | runtime vs LLM personas | Confusing for P5 |

**Recommendation:** One **`ExternalCapabilityRegistry`** that feeds intake + status API + docs; deprecate duplicate advertisement of blocked tools.

---

## Part 5: Priority Matrix

### 5.1 Quick Wins (Low Effort, High Impact)

| Capability | Provider | Effort | Impact | Priority |
|------------|----------|--------|--------|:--------:|
| Provider registry + status API extension | Internal | Low | High | **1** |
| Image resize/optimize | Sharp (already in Node ecosystem) | Low | High | **2** |
| Translation API | DeepL or Google | Low | High | **3** |
| Env/docs for video + media keys | Internal | Low | Medium | **4** |
| Wire `smart_visual` or remove from capability ads | Internal | Low | Medium | **5** |

### 5.2 Medium Effort (High Impact)

| Capability | Provider | Effort | Impact | Priority |
|------------|----------|--------|--------|:--------:|
| Video editing templates | Replicate | Medium | High | **6** |
| TTS for video/slideshow | ElevenLabs / OpenAI TTS | Medium | Medium | **7** |
| Slideshow polish | Canva or headless Puppeteer | Medium | High | **8** |
| Unified cost dashboard (admin) | Internal | Medium | High | **9** |
| Screen pipeline (4 blockers) | Internal | Medium | High | **10** |

### 5.3 High Effort (Long-term)

| Capability | Provider | Effort | Impact | Priority |
|------------|----------|--------|--------|:--------:|
| Self-learning provider routing | Custom + PIL | High | High | Month 3+ |
| Community marketplace | Custom | High | High | Month 4+ |
| Agent swarm orchestration | Custom | High | Medium | Month 4+ |
| Developer SDK + validation | Custom | High | High | Month 3+ |

---

## Part 6: Integration Readiness Scorecard

| Category | Score (0–10) | Notes |
|----------|:------------:|-------|
| Architecture readiness | **7** | Strong `dispatchTool` seam; fragmented registries |
| External adapter readiness | **6** | Domain adapters exist; no unified facade |
| Provider support (current) | **6** | LLM, video, OCR, media partial |
| API key management | **4** | Env-only; incomplete docs |
| Fallback handling | **7** | LLM/OCR/skills; not dispatcher-wide |
| Cost tracking | **6** | `LlmUsageDaily`; no video/TTS ledger |
| Performance / cache | **7** | `LlmCache`, OCR reuse patterns |
| Developer tooling | **4** | Skill HTTP API; no marketplace SDK |
| Governance / safety | **8** | Confirmation, honestBlocker, PIL rules |
| UI integration | **7** | Performer, Explore, feature badges |
| **OVERALL** | **6.2** | **Conditionally ready for provider-by-provider integration** |

---

## Part 7: Recommendations

### 7.1 Immediate Actions (Week 1)

| Action | Owner | Effort | Deliverable |
|--------|-------|--------|-------------|
| Create `ExternalCapabilityRegistry` (provider id, env keys, executor, health fn) | Core | 4h | `lib/external/externalCapabilityRegistry.js` |
| Extend `/api/status/features` (media, LLM, storage, translation) | Core | 2h | Dashboard badges |
| Document all integration env vars in `.env.example` | Core | 2h | Single source |
| Add dispatcher retry wrapper (opt-in per tool) | Core | 4h | `toolDispatcher` patch |
| Remove or implement `smart_visual` / screen blockers from capability ads | Core + Dashboard | 2h | Honest UX |

### 7.2 Short-term (Weeks 2–4)

| Action | Effort |
|--------|--------|
| Sharp-based image optimize tool executor | 4h |
| DeepL translation executor (alongside Anthropic) | 4h |
| Non-LLM usage table + admin slice | 2 days |
| Replicate adapter spike (one model) | 1 day |
| Consolidate skill registry read path for intake | 2 days |

### 7.3 Medium-term (Months 2–3)

| Action | Effort |
|--------|--------|
| Video editing via Replicate | 1 day |
| Slideshow via Canva or Puppeteer PDF | 1–2 days |
| ElevenLabs TTS tool | 1 day |
| Provider health cron + degraded mode | 1 day |
| External capability plugin manifest (JSON schema) | 3 days |

### 7.4 Long-term (Months 4–6)

| Action | Effort |
|--------|--------|
| Self-learning: outcome → provider weight updates (PIL) | 2 weeks |
| Community marketplace (list, install, validate skills) | 2 weeks |
| Developer SDK (`@cardbey/skill-sdk`) | 1 week |
| Agent swarm coordinator (beyond builtin 4) | 2+ weeks |

---

## Part 8: Verification Checklist

| Check | Status |
|-------|:------:|
| Current capabilities inventoried | ✅ |
| Integration points identified | ✅ |
| Providers assessed | ✅ |
| Gaps documented | ✅ |
| Priority list created | ✅ |
| Recommendations ready | ✅ |
| Readiness score calculated | ✅ |
| Ready/Not ready assessment | ✅ **Conditionally ready** |

---

## Appendix A: Suggested `ExternalCapabilityRegistry` Shape

Minimal contract for Week 1 (design only — implement when approved):

```typescript
type ExternalCapability = {
  id: string;                    // e.g. 'video.kling'
  category: 'llm' | 'media' | 'vision' | 'tts' | 'translation' | 'storage';
  envKeys: string[];             // required secrets
  healthCheck: () => Promise<{ available: boolean; message?: string }>;
  executorTool?: string;         // maps to toolExecutors key
  costUnit?: 'token' | 'request' | 'second';
  fallbackIds?: string[];
};
```

Feed: `GET /api/status/features`, intake classifier hints, admin control center.

---

## Appendix B: Related Docs

- [PERFORMER_MISSIONS_AUDIT.md](./PERFORMER_MISSIONS_AUDIT.md) — mission-level UX/backend matrix (pre–P0 fixes; refresh recommended)
- [V1_SOFT_LAUNCH.md](./V1_SOFT_LAUNCH.md) — soft launch checklist and supported flows
- Core architecture: `apps/core/cardbey-core/docs/ARCHITECTURE.md`
- OCR fallback: `apps/core/cardbey-core/docs/OCR_FALLBACK.md`

---

## Appendix C: What “Proceed with Implementation” Means Next

This audit does **not** implement new providers. Recommended **first code slice** (smallest safe patch):

1. `externalCapabilityRegistry.js` + extend `/api/status/features`
2. Dashboard: show setup badges for translation/TTS when added
3. One provider pilot: **DeepL** or **Sharp** as new tool executor behind existing intake tools

Confirm which pilot provider to implement first.
