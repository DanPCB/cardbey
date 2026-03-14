# Cardbey Assistant Architecture — Implementation Report

**Date:** 2026-03-11  
**Scope:** One global context-aware assistant + store-level specialist sub-agents; automatic routing; one unified visible assistant surface.  
**Rule:** No breaking changes to public/frontscreen browsing, store preview, onboarding, dashboard, mission console, publishing, promotion flows, or recovered AI bubble open/close.

---

## 1. Current assistant architecture (pre-implementation)

- **Single surface:** AIDock in `CardbeyFrontscreenTopNavPreview.jsx` (route `/frontscreen`). Opened by floating 💬 button, RightIcons 💬, ContextHelpBubble “Ask AI”, and Alt+/.
- **State:** Local `msgs`, `text`, `starterPrompts` (hardcoded). No path or store awareness beyond `feedContext` and `feedType`.
- **Starter prompts:** Static list: “Find products or services”, “Ask this store”, “What is trending?”, “Help me create a store”.
- **Message handling:** Demo only: append user + “(Demo) …” reply. No intent or routing.
- **Context available today:** On frontscreen only: `pathname`, `feedMode` (slides/stores), `feedType` (food/products/services/explore). No store Id/name/type unless we pass them (e.g. from store preview later).

**Limitations:** No distinction between global vs store specialist; no context-based greeting or starters; no intent bucketing or escalation; no reuse on store/dashboard/mission pages.

---

## 2. Routing design implemented

### 2.1 Conceptual types

- **Assistant mode:** `global` | `store_specialist` (internal only; user sees one assistant).
- **Page type:** `home` | `explore` | `store` | `product` | `promo` | `qr` | `dashboard` | `mission` | `slideshow` | `onboarding` | `unknown`.
- **Business type (specialization):** `clothing` | `cafe` | `service` | `beauty` | `generic`.
- **Intent bucket:** `browse_products` | `promotions` | `how_to_buy` | `store_support` | `platform_help` | `seller_help` | `mission_help` | `cross_store_compare` | `general_question`.

### 2.2 Routing rules

- **Store specialist** when: `pageType` is store/product/promo/qr **and** (storeId or storeSlug or storeName) is present.
- **Global** for: home, explore, dashboard, mission, slideshow, onboarding, unknown, or when store context is missing.
- **Escalation:** In store_specialist mode, intents `platform_help`, `seller_help`, `mission_help`, `cross_store_compare` are handled with global-style replies (escalation path).
- **Fallback:** Missing store/type/product/promo/mission → safe fallback to generic store assistant or global; no blank states.

### 2.3 Flow

1. **On assistant open:** Resolve page context (pathname + optional store/product/promo/mission) → resolve mode → get greeting + starters → render one UI.
2. **On message or quick-action:** Bucket intent (rule-based) → get response (with optional escalation) → append user + reply.

---

## 3. Root cause of prior limitations

- No resolver: pathname and store were not mapped to page type or mode.
- No mode: global vs store specialist was not defined.
- No store specialist config: no business-type-specific greetings or starters.
- No intent bucketing or response routing: every reply was a single demo line.
- Single mount: assistant lived only on frontscreen with fixed content.

---

## 4. Files changed

| File | Change |
|------|--------|
| `src/lib/assistant/assistantTypes.js` | **New.** Types: AssistantMode, PageType, BusinessTypeSpecialization, IntentBucket, AssistantPageContext, ResolvedAssistantContext. |
| `src/lib/assistant/assistantContext.js` | **New.** getPageTypeFromPathname, normalizeBusinessType, resolvePageContext (pathname + optional store/product/promo/mission). |
| `src/lib/assistant/assistantRouter.js` | **New.** resolveAssistantMode, resolveAssistantContext, shouldEscalateToGlobal. |
| `src/lib/assistant/storeSpecialistConfig.js` | **New.** STORE_SPECIALIST_BY_TYPE, getStoreSpecialistContent(businessType, storeName). |
| `src/lib/assistant/assistantStarters.js` | **New.** getGlobalStarters(pageType), getAssistantContent(resolved). |
| `src/lib/assistant/intentBucket.js` | **New.** bucketIntent({ message, quickAction, mode }) → IntentBucket (rule-based). |
| `src/lib/assistant/responseRouter.js` | **New.** getResponseForIntent({ intentBucket, mode, storeName }) → { text, escalated }. |
| `src/lib/assistant/index.js` | **New.** Re-exports all public API. |
| `src/pages/CardbeyFrontscreenTopNavPreview.jsx` | Imports assistant API; AIDock uses resolveAssistantContext, getAssistantContent, bucketIntent, getResponseForIntent; dynamic greeting and starters; handleUserInput for chips and send; passes pathname and feedMode. |

**Not changed:** Mission console, onboarding, dashboard, store preview, publishing, promotion flows, bubble open/close behavior. No new chat widgets; one AIDock only.

---

## 5. Minimal patch summary

- **Additive layer:** New `lib/assistant` with resolver, router, starters, store config, intent bucket, response router.
- **AIDock:** On open, resolve context from pathname + feedMode + optional store* → set greeting and starters; on user input (chip or send), bucket intent → get response (with escalation) → append messages. Same UI; behavior varies by context.
- **Store specialist:** Used when pathname indicates store/product/promo/qr and store context is provided; business-type-specific content from storeSpecialistConfig; escalation for platform/cross-store/mission/seller intents.

---

## 6. Supported page contexts

| Page type | Path / context | Mode (when store present) |
|-----------|----------------|----------------------------|
| home | `/` | global |
| explore | `/frontscreen`, `/feed`, `/feed/:slug` | global |
| slideshow | `/frontscreen` with `mode=slides` | global |
| store | `/preview/store/:storeId`, `/s/:slug`, `/app/store/...`, `/dashboard/stores/:id` | store_specialist if store context passed |
| product | (future: product page path) | store_specialist |
| promo | `/p/`, `/p/promo/` | store_specialist |
| qr | `/q/`, `/mi/o/` | store_specialist |
| dashboard | `/dashboard`, `/app/back` | global |
| mission | `/app`, `/app/missions` | global |
| onboarding | `/onboarding` | global |
| unknown | any other path | global |

**Note:** On frontscreen we only pass pathname + feedMode + feedType (no store), so mode is always **global** there. Store specialist is used when the same assistant is opened from a store/preview page with storeId/storeName/businessType passed in (e.g. when we add the trigger on store preview).

---

## 7. Supported business-type specializations

| Type | Greeting / starters focus |
|------|---------------------------|
| clothing | Browse products, See offers, Sizes & styles, Ask this store |
| cafe | View menu, See offers, Opening hours, Ask this store |
| service | Browse services, See offers, How to book, Ask this store |
| beauty | Browse services, See offers, Book or visit, Ask this store |
| generic | Browse products, See offers, How to buy, Ask this store |

New types can be added in `storeSpecialistConfig.js` without changing router or UI.

---

## 8. Supported intent buckets

- browse_products  
- promotions  
- how_to_buy  
- store_support  
- platform_help  
- seller_help  
- mission_help  
- cross_store_compare  
- general_question  

Rule-based classifier uses current mode, message text, and optional quick-action label.

---

## 9. Manual verification checklist

### 9.1 Assistant opens and routing (frontscreen)

- [ ] Assistant opens on `/frontscreen` (floating button or 💬).
- [ ] Assistant opens on `/frontscreen?mode=products` (Explore).
- [ ] Home/explore uses **global** assistant: greeting and starters like “Find products or services”, “What is trending?”, “Help me create a store”, “Explore Cardbey” (or dashboard-like when on dashboard/mission if we add trigger there).
- [ ] With `mode=slides`, greeting/starters appropriate for slideshow/explore (global).
- [ ] No regression: bubble open/close, long-press, Alt+/, floating button still work.

### 9.2 Store specialist (when store context is provided)

- [ ] When AIDock is opened with store context (e.g. pathname `/preview/store/:id` and storeId/storeName/businessType passed), greeting mentions store name and starters are store-type (e.g. “Browse products”, “See offers”, “How to buy”, “Ask this store”).
- [ ] business type fallback: when businessType is unknown or missing, generic store specialist content is used.
- [ ] Store specialist escalation: e.g. user says “Compare with another store” or “What is Cardbey?” → reply is global-style (platform-level help), not store-only.

### 9.3 Intent and responses

- [ ] Clicking “Find products or services” or “What is trending?” produces a relevant reply (discovery/explore).
- [ ] Clicking “Help me create a store” produces platform/create-store style reply.
- [ ] Free-text “How do I order?” on global gives general guidance; same on store specialist (when implemented) gives store-specific guidance.

### 9.4 Regressions

- [ ] Public/frontscreen browsing and explore feed unchanged.
- [ ] Store preview and public catalog pages unchanged (assistant not yet mounted there; routing ready for when it is).
- [ ] Dashboard and mission flows unchanged.
- [ ] Recovered AI bubble: open/close, long-press, one surface only (no second chat widget).

---

## 10. Risks and follow-up

- **Store preview:** Assistant is currently only mounted on frontscreen. To have “assistant opens correctly on public store preview/catalog page” with store specialist, mount the same AIDock (or a global assistant provider that renders it once) and pass `pathname`, `storeId`, `storeName`, `businessType` from the store preview page when opening.
- **Dashboard/mission:** Same: add trigger and pass pathname (and missionId if needed) so global assistant gets dashboard/mission starters when opened there.
- **LLM/backend:** Current responses are rule-based placeholders. Connecting to an LLM or backend for real answers is out of scope and can be wired behind `getResponseForIntent` or a new layer.
- **Observability:** Dev logging: resolved mode, pageType, businessType, and (when implemented) escalation. Optional: add intent bucket and missing-context logs in dev.

---

## 11. How to add the assistant to store preview (follow-up)

1. Add a floating “Ask” or 💬 on the public store preview page (`StorePreviewPage.tsx` or equivalent) that opens the assistant.
2. Use a shared assistant state (e.g. React context or global store): `openAssistant(context)`, where `context = { pathname, storeId, storeName, storeSlug, businessType }` from the current store.
3. Render the same AIDock once (e.g. in App or a layout) and feed it `open` + `context` from that state. AIDock already accepts `pathname`, `storeId`, `storeName`, `storeSlug`, `businessType` and will resolve to store_specialist and show store-specific greeting and starters.

---

*Implementation is additive and minimal; one unified assistant surface; routing and context are ready for store preview and dashboard/mission when triggers are added.*
