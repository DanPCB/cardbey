# Audit: Is PIL Truly Context-Aware or a Generic Popup?

**Date:** 2026-07-22  
**Evidence UI:** CA HANDYMAN SERVICE on cardbey.com — greeting matched production screenshots  
**Verdict:** **Partially context-aware** — name + slogan substitution onto the **`general`** template; not a full service-business composition. Internal offer context `product_collection` was leaked to customers.

---

## 1. Runtime Trace (DTO → UI)

| Stage | Module | Function | Input → Output |
|-------|--------|----------|----------------|
| 1. Route | `PublicStoreSlugRoute.tsx` | `getPublicStore(slug)` | slug → public store DTO |
| 2. Register | `useRegisterAssistantPublicSnapshot.ts` | `snapshotFromPublicStore` → `registerAssistantPublicSnapshot` | DTO → `AssistantPublicSnapshot` in module Map |
| 3. Appear gate | `storefrontAssistantAppearGate.ts` | `markStorefrontAssistantSnapshotReady` | pathname flagged ready |
| 4. Activity | `useActivityDetection.ts` | storefront welcome / dwell | offer id e.g. `welcome_hello` or `help_screen_dwell` |
| 5. Enrich | `enrichProactiveOffer.ts` | `enrichProactiveOfferWithStoreGreeting` | raw offer + snapshot → composed greeting |
| 6. Context | `resolveAssistantContext.ts` | `resolveAssistantContext` | snapshot → `AssistantContext` |
| 7. Type map | `mapBusinessType.ts` | `mapToAssistantBusinessType(snapshot.businessType)` | raw type string → template key |
| 8. Featured | `resolveFeaturedOpportunity.ts` | priority candidates | campaign/promo/catalog or `{}` |
| 9. Compose | `composeAssistantGreeting.ts` | `composeAssistantGreeting` | context → title/message/actions |
| 10. Templates | `assistantTemplates.ts` | `getAssistantTemplate(type)` | type → greeting + CTA list |
| 11. UI | `ProactiveOffer.tsx` → `AssistantGreetingCard.tsx` | render | passes `contextLabel={offer.context}` |

---

## 2. Context Snapshot — CA HANDYMAN SERVICE (inferred from live UI)

Live capture of private fields was not available from this environment; the **rendered strings uniquely fingerprint** the composition branch:

| Field | Inferred value | Evidence |
|-------|----------------|----------|
| `businessName` | `CA HANDYMAN SERVICE` | Title + body prefix |
| `mappedBusinessType` / `selectedTemplate` | **`general`** | CTAs exactly `Browse`, `See Featured`, `Ask Question` (`assistantTemplates.general`) |
| Body composition | **`slogan + general.defaultMessage`** | Exact: `"CA HANDYMAN SERVICE I can help you browse what we offer, see featured picks, or ask a question."` matches `typeAwareMessage` slogan branch + general default |
| `pageType` / offer context | **`product_collection`** | Visible chip; from `activityDetector` dwell metadata / offer.context — **not** from business type |
| `featuredOpportunity` | absent in UI | No Featured block rendered |
| `recentActivity` | not used in copy | No lifecycle headline |
| True static fallback | **No** | Fallback is `Welcome!` / `How can I help you today?` / `Ask Question` only — name would be absent |

Sanitized decision object (reconstructed):

```json
{
  "contextSource": "public-store-snapshot",
  "contextReady": true,
  "businessTypeRaw": "(unmapped or hybrid/general — not service_quote_required)",
  "mappedBusinessType": "general",
  "pageType": "collection",
  "selectedTemplate": "general",
  "recentActivityUsed": false,
  "featuredOpportunityUsed": false,
  "selectedActions": ["Browse", "See Featured", "Ask Question"],
  "fallbackUsed": false,
  "fallbackReason": null,
  "sloganUsed": true,
  "offerContextPreserved": "product_collection",
  "branch": "business_aware_general_template"
}
```

---

## 3. Decision Report — Why this exact copy / CTAs

### Title
`fillTemplate('Welcome to {businessName}!', { businessName })`  
→ **Welcome to CA HANDYMAN SERVICE!**  
Works for **any** template including `general`. Name alone ≠ context-aware.

### Body
```ts
// composeAssistantGreeting.ts — typeAwareMessage
if (slogan) return `${slogan} ${defaultMessage}`;
```
With `slogan ≈ "CA HANDYMAN SERVICE"` and template `general.defaultMessage`:
→ **CA HANDYMAN SERVICE I can help you browse what we offer…**

If type had been `service`, CTAs would be Request Quote / Book Service / … even with slogan prepend (unless slogan path still used service defaultMessage). **CTAs prove type = general.**

### CTAs
Selected from `ASSISTANT_TEMPLATES.general.actions` after capability filter.  
`deriveCapabilities` forces `catalog: true` and `messaging: true`, so Browse/Featured/Ask are never filtered out.

### `product_collection` chip
- Origin: `ActivityDetector` tags every non-QR dwell with `metadata.context: 'product_collection'`
- Offer catalog sets `context: 'product_collection'` on dwell offers
- `applyGreetingToOffer` **preserves** `offer.context` after enrichment
- `ProactiveOffer` passes it to `AssistantGreetingCard` as `contextLabel`
- **Does not select CTAs** — cosmetic/analytics leak only
- `normalizePageType('product_collection')` → page.type `collection` (metadata only today)

---

## 4. Root Cause Classification

| Question | Answer |
|----------|--------|
| Context-aware? | **Partial** |
| Generic fallback? | **No** (true fallback has no store name) |
| Generic template + name? | **Yes** — `general` template + name + redundant slogan |
| Stale race freezing fallback? | **Unlikely for this screenshot** — composed greeting present; re-enrich at show already exists |
| Why not service template? | `mapToAssistantBusinessType(snapshot.businessType)` returned `general` — raw DTO type missing handyman/service signals (mapper did not use store **name**) |
| Page type override business type? | **No for CTAs** — page type does not pick template; activity context only leaked as chip |

---

## 5. Priority Rules (actual vs recommended)

**Actual (V1):**
1. Merchant `welcomeTitle` / `welcomeMessage` / `preferredCTA` overrides  
2. Business-type template (after map)  
3. Slogan prepended to template default (even when slogan === name)  
4. Featured block if candidate resolves  
5. Static fallback only if no snapshot/name  

**Not implemented:** recent lifecycle activity outranking inventory; page context must not imply product-collection UX for service stores.

**Recommended (documented for follow-up):**  
Recent public lifecycle → featured campaign/loyalty → business-type greeting → capability CTAs → generic fallback.

---

## 6. Timing / Caching

| Concern | Finding |
|---------|---------|
| 5s timer | Starts on **first user interaction**, not on snapshot ready |
| Greeting freeze | Re-composed at schedule **and** at show (`useActivityDetection`) — good |
| Defer while loading | Storefront enrich returns `defer` until snapshot — good |
| Snapshot cache | In-memory Map by businessId; merge on re-register; **not cleared** on leave |
| Offer cooldown | Session-global by offer id (cross-store welcome cooldown risk) |
| Cross-store copy leak | Low for composed greeting (re-resolve by id); cooldown can suppress B after A |

---

## 7. Cross-store expectation (templates)

When `businessType` is correctly mapped:

| Type | Distinct CTAs (examples) |
|------|---------------------------|
| service | Request Quote, Book Service, Browse Services |
| retail | Best Sellers, New Arrivals, Hot Deals |
| restaurant | Today's Specials, Reserve Table, Order Now, Menu |
| beauty | Browse Services, Book Appointment, See Offers |
| general | Browse, See Featured, Ask Question |

Material difference requires **correct type mapping**. Name-only + general ≈ same popup for all mis-typed stores.

---

## 8. Fix Plan (smallest safe — applied with this audit)

1. **Hide** `product_collection` / offer.context from production UI (DEV-only diagnostics).  
2. **Infer type from name/slogan** only when mapped type is `general` (unlocks handyman → service).  
3. **Skip slogan prepend** when slogan equals/contains business name (stops “NAME NAME I can help…”).  
4. **DEV/staging diagnostic object** on each compose/enrich (`getLastAssistantGreetingDecision`).  
5. **Tests** proving multi-type CTA divergence + CA Handyman-like name inference + no public context chip.

Out of scope for this slice: full lifecycle priority engine, clearing snapshot Map on navigate, per-store offer cooldowns.

---

## 9. Acceptance vs current state

| Criterion | Before audit fixes | After smallest fixes |
|-----------|--------------------|----------------------|
| Composed from current store snapshot | Partial | Partial → improved type inference |
| Business type changes message/CTAs | Only if DTO type mapped | Also if name implies service/etc. when type general |
| Capabilities change actions | Weak (catalog forced true) | Unchanged (follow-up) |
| Recent activity changes copy | No | No (follow-up) |
| Featured can change card | Yes when candidates exist | Yes |
| Fallback explicit | Yes | Yes + diagnostics |
| 5s does not freeze early fallback | Mostly yes | Yes |
| Cross-store recompute | Mostly yes | Yes |
| No public `product_collection` | **Fail** | **Pass** (prod) |
| Multi-type tests | Partial | Expanded |
