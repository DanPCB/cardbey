# Cardbey 4-Layer Platform Architecture Audit Report

**Date:** 2026-03-11  
**Scope:** Repository-wide mapping to Intent → Market Graph → Agent Orchestration → Experience  
**Goal:** Evaluate whether the system still follows an intent-driven, two-sided (demand + supply) platform, or has drifted toward supplier-only automation.

**CRITICAL RULE (LOCKED):** No refactors or structural changes are proposed that could break current workflows (store creation, missions, promotions, onboarding, publishing). Where risk exists, warnings and incremental, safe approaches only.

---

## 1. Executive Summary

| Layer | Purpose | Current state | Verdict |
|-------|--------|----------------|--------|
| **1. Intent** | Capture and interpret what users want | Supplier intent strong; general/buyer intent **missing or latent** | Imbalanced |
| **2. Market Graph** | Demand ↔ supply relationships | Entities exist; **no graph linking demand queries to supply**; signals are supplier-scoped | Underdeveloped |
| **3. Agent Orchestration** | Interpret intent, coordinate demand ↔ supply | **Supplier-focused** (build, promote, mission); no buyer-side matching/recommendation agents | Imbalanced |
| **4. Experience** | User-facing interfaces | **Supplier experiences strong**; buyer experiences exist (feed, store, promo, QR) but **no query/discovery/recommendation** | Imbalanced |

**Conclusion:** The codebase has **drifted toward a business automation tool for suppliers** (store builder, promotion generator, missions). The **two-sided, intent-driven platform** is only partially present: supply-side intent and artifacts are first-class; **demand-side intent capture, demand–supply graph, and buyer-facing query/recommendation flows are missing or minimal**. Restoring the platform model requires **additive** work (new APIs, new surfaces, new agents) **without** changing existing supplier workflows.

---

## 2. Architecture Diagram (ASCII)

```
                    CARD BEY — CURRENT STATE (4-LAYER VIEW)

┌─────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 1 — INTENT                                                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│  SUPPLIER INTENT (strong)              BUYER INTENT (missing / latent)           │
│  • Store opportunities → IntentRequest  • No "buyer query" API                     │
│  • Mission Inbox (type, payload)        • Demand model in schema, unused in flow  │
│  • Orchestra start (goal, entryPoint)   • No intent normalization for consumers   │
│  • Agent chat (message → planner)       • No intent history for demand            │
│  • Insights execute (entryPoint)        • Context: location/product/QR not used  │
│                                           for demand-side matching               │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 2 — MARKET GRAPH                                                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ENTITIES (exist)                     RELATIONSHIPS (supplier-scoped)            │
│  User, Business, Product, StoreOffer  • Store ↔ Offer, Product; Mission ↔ Intent │
│  StorePromo, DynamicQr, Mission       • IntentSignal → storeId/offerId (views,   │
│  IntentRequest, IntentOpportunity       qr_scan) — not linked to buyer identity   │
│  IntentSignal, Demand (schema only)   • No graph: "query → stores/offers"        │
│  AgentRun, OrchestratorTask           • No "learn from interactions" for demand  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 3 — AGENT ORCHESTRATION                                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│  SUPPLIER-SIDE (implemented)          BUYER-SIDE (missing)                       │
│  • Intent run: create_offer,          • No intent interpreter for buyer query   │
│    create_qr_for_offer, catalog,      • No matching agent (query → stores/offers)│
│    media, publish_intent_feed         • No recommendation agent for consumers   │
│  • Orchestra: build_store,            • No "store assistant" agent for buyers    │
│    generate_tags, rewrite_descriptions • Observer/reporting is supplier analytics │
│  • Agent Chat: research + planner     • Mission agent = supplier missions only   │
│    → chain plan → dispatch            • Supplier copilot = mission/draft/promo   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 4 — EXPERIENCE                                                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│  SUPPLIER (strong)                    BUYER (partial)                             │
│  • Mission console, launcher          • Discovery: /feed, /card/:slug (cards)   │
│  • Store builder, draft review       • Query: none — no search-by-intent UI      │
│  • Dashboard, stores, products       • Recommendations: none — no "for you"     │
│  • Promotion tools, Create QR        • Store assistant: MI object landing has    │
│  • Content studio, performer            chat but not general "buyer assistant"   │
│  • Single runway: intents → Execution • Public: /s/:slug, /p/:promoId, /q/:code  │
│  • All experiences operator-oriented   Intent feed = machine-readable (crawlers)│
└─────────────────────────────────────────────────────────────────────────────────┘

Flow today:  SUPPLIER INTENT → Mission/Orchestrator → Agents → Artifacts → Public pages/QR/feed
             BUYER:          → Public pages/feed (view only) → Signals (views/scans) → Opportunities (supplier)
             Missing:        BUYER QUERY → ??? → Matching/Recommendation → Buyer experience
```

---

## 3. Repo Component Mapping to the 4 Layers

### Layer 1 — Intent

| Expected component | Repo location | Status |
|--------------------|----------------|--------|
| User query inputs (supplier) | `apps/core/.../assistant.js` (chat), `miIntentsRoutes.js` (intents), `miRoutes.js` (orchestra/start), `insights/execute` | ✅ Present |
| User query inputs (buyer) | — | ❌ None. No API or UI for "what I want" from a consumer. |
| Natural language intent parsing | `interpretMissionIntentWithLlm.js`, assistant journey detection, `agentIntentRouter.js` | 🟡 Supplier / mission only |
| Intent normalization | `entryPoint` / `goal` in orchestra; `IntentRequest.type` in MI | 🟡 Supplier intents only |
| Intent history | `IntentRequest` rows, `MissionEvent` stream, `AgentMessage` | ✅ Supplier / mission |
| Contextual signals (location, product, QR) | `IntentSignal` (offer_view, qr_scan); `IntentOpportunity` (store-level) | 🟡 Used for **supplier** opportunities (e.g. create_offer, create_qr), not buyer intent |

**Buyer intent:** Schema has `Demand` (userId, scope, category, intent, context); not wired into any discovery or matching flow. No "buyer query" endpoint or stored buyer intent history for platform use.

---

### Layer 2 — Market Graph

| Expected | Repo / schema | Status |
|----------|----------------|--------|
| Users | `User` | ✅ |
| Stores | `Business` | ✅ |
| Products | `Product` | ✅ |
| Offers | `StoreOffer`, `StorePromo` | ✅ |
| Intents | `IntentRequest`, `OrchestratorTask` (entryPoint) | ✅ Supplier |
| Locations | Business has address/suburb/postcode/country; no first-class Location entity for matching | 🟡 Partial |
| Interactions | `IntentSignal` (storeId, offerId, type); no buyer identity in most flows | 🟡 Supplier-scoped |
| Categories/tags | Product.category; tags in catalog/draft | ✅ |
| Graph linking demand ↔ supply | No model or service that links "demand query" or "buyer" to "stores/offers". Intent feed is store → offers (supply out). | ❌ Missing |
| Learn from interactions | `IntentOpportunity` derives from signals to suggest **supplier** intents (e.g. create_offer). No learning for "what buyers want" or ranking for discovery. | 🟡 Supplier only |

**Verdict:** Entities exist for a graph; **relationship layer** that connects **demand (buyer queries, behavior) to supply (stores, offers)** is absent. IntentSignal is the closest; it records views/scans but is used to drive supplier opportunities, not demand-side matching or recommendations.

---

### Layer 3 — Agent Orchestration

| Agent type | Exists? | Where | Notes |
|------------|--------|--------|-------|
| Intent interpreter | 🟡 | `interpretMissionIntentWithLlm.js`, orchestra entryPoint routing | Supplier/mission only |
| Matching agent | ❌ | — | No agent that matches "buyer query" → stores/offers |
| Recommendation agent | ❌ | — | No agent producing "for you" or ranked results for consumers |
| Supplier copilot | ✅ | Mission Execution, Agent Chat (research + planner), orchestra handlers | Strong |
| Mission agent | ✅ | Intent run, orchestra job run, chain plan | Supplier missions only |
| Observer / reporting | 🟡 | IntentOpportunity (rules/LLM), intent-signals API | Supplier analytics |

**Execution paths:** All go through Mission Execution / MI Orchestrator or Insights orchestrator; all are **supplier-initiated** (create store, create offer, generate tags, run mission step). No orchestration path that starts from a **buyer request** and returns matches or recommendations.

---

### Layer 4 — Experience

| Experience | Route / component | Status |
|------------|-------------------|--------|
| **Buyer: Discovery** | `/feed`, `/feed/:slug`, `/card/:slug`, `PublicFeed`, `CardStoreSwipeView` | ✅ Present (view-only; no query) |
| **Buyer: Query** | — | ❌ No search-by-intent or "what I want" surface |
| **Buyer: Recommendations** | — | ❌ No "for you" or personalized recommendations |
| **Buyer: Store assistant** | `/mi/o/:publicId` (MIObjectLandingPage), `/q/:publicCode` (PrintBagLandingPage) | 🟡 Single-store/object context; not general assistant |
| **Supplier: Mission console** | Mission launcher, Execution drawer, Mission list | ✅ |
| **Supplier: Store builder** | Draft creation, review, publish flow | ✅ |
| **Supplier: Dashboard** | `/dashboard`, stores, products | ✅ |
| **Supplier: Promotion tools** | Create promo, QR, `/p/:promoId`, intent feed | ✅ |
| **Public machine-readable** | `GET /api/public/stores/:storeId/intent-feed` | ✅ Supply-out (store + offers + URLs) |

**Conclusion:** Buyer-facing **surfaces exist** (feed, card, store, promo, QR landing) but are **passive**: view this store/card/offer. There is **no buyer-side interaction** for query, recommendations, or assistant that would make the platform "two-sided" from the user’s perspective.

---

## 4. Architectural Imbalance Summary

- **Strong:** Supplier intent capture, supplier agent orchestration (intent run, orchestra, agent chat), supplier experiences (mission console, store builder, promotions), and public artifact exposure (intent feed, public pages, QR). Single Runway is clear and documented.
- **Missing or weak:**  
  - **Intent layer:** No general **buyer** intent capture (query, preferences, history).  
  - **Market graph:** No **demand–supply** link (e.g. query → stores/offers); signals are supplier-scoped.  
  - **Agents:** No **matching** or **recommendation** agent for buyer requests.  
  - **Experience:** No **query** or **recommendations** UI for buyers; no **store assistant** in the platform sense (only per-object landing chat).

This imbalance pushes the product toward **single-sided supplier automation** (store builder, promotion generator, missions) rather than a **two-sided intent-driven platform** connecting demand and supply.

---

## 5. Risk Analysis

- **Refactors / structural changes:** Any change that alters **Single Runway** (intent → Mission Execution → orchestrator → agents) or touches **store creation, mission execution, promotion flows, onboarding, or publishing** can break current working workflows.  
  **Mitigation:** Do **not** refactor existing supplier flows. Add new layers (APIs, agents, UIs) **alongside** current behavior.
- **Schema changes:** Adding fields or new models (e.g. for demand-side intent or graph) is low risk if additive and optional. Changing existing relations or removing tables is high risk.  
  **Mitigation:** Prefer **additive** schema (new tables or optional columns); keep existing contracts stable.
- **New buyer-facing APIs:** Adding read-only or new write paths (e.g. buyer query, store recommendation) does not conflict with existing auth or mission flows if they do not reuse the same route or permission model in a breaking way.  
  **Mitigation:** New routes (e.g. `/api/public/query` or `/api/discovery/...`) and optional use of `Demand` or new tables.
- **Existing workflows to protect:**  
  - Store creation (orchestra `build_store`, draft, review, publish).  
  - Mission execution (intent run, orchestra job run, agent chat chain).  
  - Promotion creation and QR (create_offer, create_qr_for_offer, publish_intent_feed).  
  - Onboarding and auth.  
  - Intent feed and public offer/QR behavior.

---

## 6. Minimal Additions to Restore Intent-Driven, Two-Sided Model

Only **additive** changes; no large rewrites.

1. **Intent layer (buyer)**  
   - **Add:** Optional **buyer intent capture** (e.g. store query, category, location) via a **new** API (e.g. `POST /api/public/discovery/query` or similar) that stores to `Demand` or a new lightweight table.  
   - **Do not change:** Existing assistant, MI intents, orchestra, or agent chat.

2. **Market graph**  
   - **Add:** Use **IntentSignal** and (if added) buyer query logs to **derive** or store a minimal "query → store/offer" or "view → store" link (e.g. new table or analytics view). No replacement of existing IntentSignal or IntentOpportunity logic.  
   - **Do not change:** Current store/offer/product relations or mission/intent models.

3. **Agents**  
   - **Add:** A **matching or recommendation** path (e.g. new handler or small service) that, given a **buyer query** (and optional location), returns a list of stores/offers. Can be rule-based at first (e.g. by category/slug search), then enhanced with LLM or ranking later.  
   - **Do not change:** Existing intent run, orchestra, or agent chat flows.

4. **Experience**  
   - **Add:** A **buyer-facing query/discovery** surface (e.g. search bar or simple "what are you looking for?" on `/feed` or a new route) that calls the new discovery API and shows results.  
   - **Do not change:** Existing supplier dashboard, mission console, store builder, or promo tools.

---

## 7. Safe Evolution Roadmap

### Add first (incremental, low risk)

1. **Buyer intent API (minimal)**  
   - New route, e.g. `POST /api/public/discovery/query` with body `{ query?, category?, location? }`.  
   - Persist to `Demand` or a new `DiscoveryQuery` table; no change to existing APIs.  
   - Optional: same endpoint returns a **simple list of stores/offers** (e.g. by category or keyword match) so the platform has a single "demand in → supply out" path.

2. **Matching/recommendation (minimal)**  
   - New handler or module that, given query/category/location, returns store/offer IDs (e.g. from Business + StoreOffer + Product.category). No new agents in the Mission Execution path; can be a separate service or route.  
   - Wire the new discovery API to this so that "query → results" works end-to-end.

3. **Discovery UX (minimal)**  
   - Add a search or "what are you looking for?" on the public feed (or a dedicated discovery page) that calls the new API and displays results.  
   - No change to supplier UIs or mission flows.

### Postpone (until above is stable)

- Full **graph** layer (e.g. graph DB or relationship service) for demand–supply.  
- **LLM-based** buyer intent parsing or recommendation.  
- **Learning from interactions** (e.g. ranking by views/clicks) for discovery.  
- Expanding **store assistant** to a general buyer assistant across stores.

### Do not change yet

- Single Runway (Mission Console → IntentRequest → Mission Execution → MI Orchestrator → agents).  
- Store creation, draft review, publish flow.  
- Mission intent run and orchestra job run.  
- Promotion and QR creation and intent feed.  
- Existing auth, onboarding, and permission model for supplier flows.  
- Intent feed contract (`GET /api/public/stores/:storeId/intent-feed`) and public offer/QR behavior.

---

## 8. References

- `docs/SYSTEM_AUDIT_USER_INTENT_ORCHESTRATOR_MISSION_PLAN.md` — Intent capture and orchestrator gaps.  
- `docs/CARDBEY_ARCHITECT_OVERVIEW.md` — Single Runway and domains.  
- `docs/CARDBEY_UI_MAP.md` — Intent flow from UI.  
- `docs/SINGLE_RUNWAY_AUDIT_AND_PLAN.md` — One runway design.  
- `docs/CARDBEY_AGENTIC_INTEGRATION_IMPLEMENTATION_PLAN.md` — Mission plan and agents.  
- `CARDBEY_ARCHITECTURE_AUDIT_REPORT.md` — Store creation and Smart Object audit.

---

*End of audit. All recommendations are additive and do not require refactors to existing working workflows.*
