# Cardbey Entity Framework — Compatibility Report & Implementation Next Steps

**Date:** 2026-03-08  
**Scope:** Current codebase vs. Cardbey Entity Framework (Brain, Body, Surface, Signals, Missions).  
**Purpose:** Assess compatible status and suggest next steps for implementation.

---

## 1. Executive Summary

The codebase already implements **many building blocks** that align with the Entity Framework (scoped MI context, object-aware chat, surfaces, signals, missions, Content Studio). It does **not** yet use the **formal entity contract** (`entityId`, `entityType`, `brainContext`, `bodyConfig`, `surfaceConfig`, `signalConfig`, `missionHooks`) or a single **entity-type taxonomy** (store / menu / category / product / promotion / QR). This report maps current state to the framework and recommends a minimal, safe path to adopt the contract and MVP entity priorities (Store, Product, Promotion).

---

## 2. Framework Layers — Current Compatibility

### A. Brain (MI intelligence layer)

| Framework expectation | Current status | Location / notes |
|------------------------|----------------|-------------------|
| Global brain with scoped context per entity | **Partial** | `useMIHelperStore`: modes `global` \| `product` \| `category`; `openForProduct`, `openForCategory`, `openGlobal` set context (storeId, draftId, productId, productName, categoryId, categoryLabel, intent, surfaceKey). No explicit **store** or **promotion** mode. |
| Context understanding, conversation, recommendations | **Yes** | Assistant/chat in `assistant.js` (system prompt by mode); `POST /api/mi/chat` called from frontend (`chatMI()` in `mi.api.ts`); MIObjectLandingPage passes objectId (`promo_*` or `item_*`), surface `qr_landing`, objectType, storeId, promoId. |
| Task execution, mission orchestration | **Yes** | Orchestra: `POST /api/mi/orchestra/start`, `GET /api/mi/orchestra/job/:jobId`, `POST .../run`; missions: `startMissionFromGoal`, dispatch, agent runs (e.g. `agentChatTurn` entityType/entityId). |
| Memory/state, policy/rules | **Partial** | MIEntity DB model has `miBrain` JSON (role, primaryIntent, context, capabilities, behaviorRules, ctaPlan, analyticsPlan, lifecycle). Used for **creative assets** (signage, reports, screen items, templates); not yet for store/product/promotion as first-class entities. |

**Verdict:** Brain is shared; context is scoped by **product** and **category** in the dashboard and by **object** (item/promo) on the public MI object landing page. Store-level and promotion-level brain context exist only implicitly (e.g. via storeId in payloads), not as named entity modes.

---

### B. Body (interactive form of the entity)

| Framework expectation | Current status | Location / notes |
|------------------------|----------------|-------------------|
| Assistant bubble, chat panel, guided card, etc. | **Yes** | MIHelperPanel (slide-in), MiConsole (embedded/standalone), AmbientMIAssistant (product card popover), MIObjectLandingPage (public QR landing with chat). |
| Greet, display responses, quick actions, guide tasks, collect input, trigger missions | **Partial** | Quick actions: MICommandBar chips (autofill, tags, rewrite, hero, smart promo, add 20 items); MI_SUGGESTIONS / SUGGESTED_ACTIONS; AmbientMIAssistant suggestions (Create Smart Promotion, Auto-category, Rewrite description). No unified **bodyConfig** (e.g. quickActions array per entity type). |
| Body modes (Guide / Task / Performer / Operator) | **Not formalized** | Behavior is implicit (e.g. store draft = guide/task; product = task; promo = performer). No `bodyMode` field or doctrine. |

**Verdict:** Multiple “bodies” exist (panel, console, ambient, public chat) and suggestion lists exist, but there is no single **body contract** (bodyConfig) per entity type or per surface.

---

### C. Surface (where the entity lives)

| Framework expectation | Current status | Location / notes |
|------------------------|----------------|-------------------|
| Store page, menu page, product page, promotion landing, QR landing, smart screen, etc. | **Yes** | Store draft review (store/menu/category/product in one surface); MIObjectLandingPage (`/mi/o/:publicId` — QR landing); public promo/offer pages; Content Studio preview. `mi.api.ts` defines surface: `dashboard` \| `storefront` \| `qr_landing` \| `cnet_screen` \| `social_embed`. |
| Same entity on multiple surfaces | **Possible** | Same store/product/promo can be referenced from dashboard and from public landing; not modeled as “one entity, many surfaces” with surfaceConfig. |

**Verdict:** Surfaces exist and are passed in context; **surfaceConfig** (e.g. surfaceType, placement) is not part of a formal entity descriptor.

---

### D. Signals (feedback loop)

| Framework expectation | Current status | Location / notes |
|------------------------|----------------|-------------------|
| Views, clicks, chat opens, messages, scroll, QR scans, conversion, add-to-cart, dwell time | **Partial** | ScanEvent + IntentSignal on QR (`/q/:code`, `qr.js`); StorePromo.scanCount; trackPromoScan; MIEventRequest (view, scan, tap, purchase, chat, share); `POST /api/mi/event` referenced in frontend (`logMIEvent`). **Gap:** No single **signalConfig** per entity (e.g. trackViews, trackChats); signals not yet consistently attached to “entity” as first-class. |

**Verdict:** QR scans and some events are recorded; the **entity-centric signal contract** (signalConfig + feed into MI/missions) is not standardized.

---

### E. Missions (trigger / continue / receive)

| Framework expectation | Current status | Location / notes |
|------------------------|----------------|-------------------|
| Entities trigger/continue missions, receive outputs | **Partial** | Orchestra and mission system: build_store, create_promotion, repair, etc. MissionOrchestraContext has storeId, draftId, campaignId, productIds. Agent runs can take entityType/entityId (e.g. agentChatTurn). **Gap:** No **missionHooks** map on the entity (e.g. onHighInterest → create_campaign); hooks are implicit in UI/flows, not in entity schema. |

**Verdict:** Missions exist and can be started with context; **missionHooks** as part of the entity contract are not implemented.

---

## 3. Entity Contract — Current vs Required

The framework requires every entity to expose:

```json
{
  "entityId": "string",
  "entityType": "string",
  "objectId": "string",
  "brainContext": {},
  "bodyConfig": {},
  "surfaceConfig": {},
  "signalConfig": {},
  "missionHooks": {}
}
```

**Current state:**

- **entityId / entityType / objectId:** Not used as a single contract. Ad hoc identifiers: `productId`, `categoryId`, `objectId` (e.g. `promo_${id}` or `item_${id}`), storeId, draftId, jobId.
- **brainContext:** Partially present as **MIHelperContext** (storeId, draftId, productId, productName, categoryId, categoryLabel, intent, surfaceKey, pageRoute). Not named brainContext or aligned to entity types.
- **bodyConfig / surfaceConfig / signalConfig / missionHooks:** Not present in any shared schema or API response.

**Conclusion:** The **formal entity contract** is not implemented. Introducing it would be an additive, backward-compatible layer if built as a **view** over existing objects (store, product, promotion) rather than a big-bang refactor.

---

## 4. Entity Types vs Current Objects

| Entity type (framework) | Raw object in codebase | MI / body today |
|-------------------------|-------------------------|-----------------|
| **Store** | Business, DraftStore, storeId | Store context in draft review; no dedicated “store entity” mode in MIHelperStore (only global/product/category). |
| **Menu / catalog** | DraftStore.preview (items), catalog | Treated as part of store draft; category-level MI (openForCategory). |
| **Category** | categoryId, categoryLabel | openForCategory; suggestions for “Improve items in category”. |
| **Product / item** | Product, draft items | openForProduct; AmbientMIAssistant; smart promo; product-scoped suggestions. |
| **Promotion** | StorePromo, PromoInstance, Content (promo) | MIObjectLandingPage (promo_* objectId); chat with objectType, promoId; no dashboard “promotion entity” panel. |
| **QR / poster / screen** | DynamicQr, Content, SignageAsset | MIObjectLandingPage; resolveMI/chatMI with surface qr_landing; MIEntity for creative/screen. |

**Conclusion:** Store, product, and promotion are the MVP entity priorities. Today: **product** and **category** have explicit MI modes and UI; **store** is implicit (global + storeId in context); **promotion** has public landing + chat but no dashboard entity panel or store-like “promotion mode.”

---

## 5. Universal MI Interface & Body Modes

- **Shared primitives (greet, ask, answer, suggest, act, handoff_to_mission):** Partially present (chat, suggestions, run mission from goal). Not documented as a single “MI interface” contract.
- **Body modes (Guide / Task / Performer / Operator):** Not formalized in types or config; behavior is implicit per surface/feature.

---

## 6. Content Studio vs “Entity Body Builder”

Framework: *Content Studio = where raw artifact gets body config, behavior, deployment surface, becomes entity-ready.*

**Current state:** Content Studio is the editor for promotion (and other) templates; publish flow configures promo (e.g. CTA, QR, tracking) and deploys. It does not yet expose **bodyConfig** (quick actions, avatar, assistant enabled) or **missionHooks** as editable entity settings. Adding “entity body builder” would be an extension of Content Studio (e.g. entity tab or panel) rather than a rewrite.

---

## 7. Backend API Gaps

- **POST /api/mi/chat:** Called by frontend (`chatMI()` → `/api/mi/chat`). Not present in `miRoutes.js` (no `router.post('/chat', ...)`). Either implemented elsewhere or returns 404; must be confirmed and implemented or stubbed with object-aware handler.
- **POST /api/mi/event:** Frontend has `logMIEvent()` → `/api/mi/event`. Not listed in miRoutes; same as above.
- **POST /api/mi/act:** Frontend has `actMI()` → `/api/mi/act`. Not in miRoutes.
- **POST /api/mi/resolve:** Implemented in miRoutes; returns minimal stub (intent: inform, empty actions). Can be extended to resolve by entityId/objectId and return entity contract slice.

---

## 8. Summary Table

| Area | Compatible | Partial | Not present |
|------|------------|--------|-------------|
| Brain (scoped context) | ✅ product, category, object | Store/promo as explicit mode | — |
| Body (UI + quick actions) | ✅ panels, chips, suggestions | bodyConfig, bodyMode | — |
| Surface | ✅ dashboard, qr_landing, etc. | surfaceConfig on entity | — |
| Signals | ✅ scan, some events | signalConfig, entity-scoped | — |
| Missions | ✅ orchestra, dispatch | missionHooks on entity | — |
| Entity contract (schema) | — | — | ✅ Full contract |
| Store / Product / Promotion as first-class entity types | — | Product, promo (partial) | Store entity mode |
| Content Studio as entity body builder | — | Publish/config | bodyConfig/hooks UI |
| /api/mi/chat, /event, /act | — | Frontend calls exist | Backend routes |

---

## 9. Recommended Next Steps (Implementation)

### Phase 1 — Minimal entity contract (no breaking changes)

1. **Define shared types (Doctrine 1 & 2)**  
   - Add `CardbeyEntity` (or equivalent) type: entityId, entityType, objectId, brainContext, bodyConfig, surfaceConfig, signalConfig, missionHooks.  
   - Place in a shared package or `apps/core` so dashboard and core can import.  
   - Do not change existing APIs or DB schema yet; use as a **target shape** for new endpoints and for mapping existing objects.

2. **Implement or confirm MI object endpoints**  
   - Ensure **POST /api/mi/chat** exists and is object-aware (objectId, messages, context with surface, objectType, storeId, promoId). If missing, add in miRoutes and delegate to existing assistant or a thin object-scoped handler.  
   - Add **POST /api/mi/event** if missing (log view/scan/tap/chat per objectId; persist to MIEvent or IntentSignal/ScanEvent as appropriate).  
   - Add **POST /api/mi/act** if missing (execute one action for objectId; optional for MVP).

3. **Entity “view” API (read-only)**  
   - Add **GET /api/mi/entity/:entityType/:objectId** (or query by entityId) that returns the **entity contract** for a given store, product, or promotion.  
   - Derive from existing data (Business/DraftStore, Product/draft item, StorePromo/PromoInstance) + fixed bodyConfig/surfaceConfig/signalConfig/missionHooks per entity type.  
   - Keeps existing APIs unchanged; consumers can start using the contract where needed.

### Phase 2 — MVP entity priorities (Store, Product, Promotion)

4. **Store entity**  
   - Add **store** mode to MIHelperStore (or equivalent) so “open for store” sets brainContext (storeId, draftId, vertical, etc.).  
   - Define default bodyConfig/surfaceConfig/signalConfig/missionHooks for type `store` (e.g. quickActions: browse_catalog, show_best_sellers, show_promotions, ask_question; missionHooks: onLowEngagement, onHighInterest).  
   - Expose store entity in GET /api/mi/entity/store/:storeId (or by objectId that resolves to store).

5. **Product entity**  
   - Align existing product mode with the contract: ensure brainContext and bodyConfig (quickActions: recommend_similar, customize, buy_now) are returned from entity API and used by the panel/suggestions where useful.  
   - Add missionHooks (e.g. onRepeatedQuestions → generate_product_faq, onLowConversion → improve_product_copy) to the product entity view and, when ready, to mission triggers.

6. **Promotion entity**  
   - Add **promotion** entity type and, if useful, a “promotion mode” in the dashboard (e.g. open MI for this promo).  
   - Entity view for type `promotion`: objectId = promo instance or store promo id; bodyConfig (performer mode; claim_offer, view_products, chat_now); missionHooks (onHighViewsLowConversion, onStrongResponse).  
   - Ensure MIObjectLandingPage and chat use this contract when available (e.g. resolve entity then chat).

### Phase 3 — Doctrine and product consistency

7. **Body modes and universal MI interface**  
   - Document bodyMode (guide / task / performer / operator) and map existing UIs to them.  
   - Standardize quick actions and suggestions per entity type so “every entity can expose the same MI interaction model, adapted by context.”

8. **Signals → missions**  
   - Ensure signalConfig is stored/returned per entity and that key events (views, scans, chat opens, conversion) can drive mission suggestions or triggers (Doctrine 4).  
   - Prefer minimal hooks (e.g. “onLowConversion” → suggest mission) without changing existing event pipelines.

9. **Content Studio as entity body builder**  
   - Add optional “Entity” or “Behavior” section in Content Studio (e.g. for promotion templates): bodyConfig (quick actions, avatar, chat on/off), missionHooks (on high interest → launch_campaign).  
   - Persist in template/content metadata or in a new table keyed by content/promo id; merge into entity view when serving GET /api/mi/entity/promotion/:id.

### Phase 4 — Optional extensions

10. **Menu/Category entities**  
    - Expose category (and optionally menu) as entity types with entity view and, if needed, category/menu modes in the dashboard.  
11. **QR/Screen entity**  
    - Align existing MIEntity (creative/screen) with the Cardbey entity contract where useful (e.g. bodyConfig, surfaceConfig for device/screen).  

---

## 10. Risks and Mitigations

- **Scope creep:** Limit Phase 1 to types + one entity view endpoint + chat/event/act. Do not refactor existing store/product/promo APIs.  
- **Breaking changes:** Entity contract is additive. Existing callers keep using storeId, productId, draftId, etc.; new code can use entityId/entityType/objectId and the contract.  
- **Backend routes:** Verify where /api/mi/chat, /event, /act are mounted (e.g. another router or app); add to miRoutes if they are missing and document.

---

## 11. One-Line Definition (Framework)

> A Cardbey Entity is any object embedded with MI brain, interactive body, deployment surface, and signal loop, allowing it to interact, guide, and trigger missions.

**Current codebase:** Objects (store, product, promotion, etc.) already have brain-like context, body-like UIs, surfaces, and some signals and missions; they do not yet conform to a **single entity contract** or **entity-type taxonomy**. Implementing the contract as an additive layer and then filling in Store, Product, and Promotion entities (with optional Content Studio body builder) will align the system with the framework without breaking existing behavior.

---

*End of report.*
