# V1 Promo Shot List — Golden Path (25–30s)

**Total runtime:** 28s (within 25–30s target)  
**Environment:** `https://cardbey-dashboard-staging.onrender.com`  
**Primary business:** Market Lane Coffee (draft reveal)  
**Intake alt:** `modernsecuritydoors.com.au` or Vietnam factory line (editor VO)

---

## Shot 1 — Problem hook

| Field | Value |
|-------|-------|
| **Duration** | 3s |
| **Route** | N/A (external) |
| **User action** | None |
| **Visible text** | Editor-supplied problem footage |
| **Product state** | N/A |
| **Crop / zoom** | Full frame |
| **Footage type** | **GENERATED VIDEO** (external B-roll) |

---

## Shot 2 — Global Front + Create CTA

| Field | Value |
|-------|-------|
| **Duration** | 3s |
| **Route** | `/` |
| **User action** | Land on Global Front; hover or tap **Create Your Business** (header) |
| **Visible text** | “Create Your Business”, feed chrome |
| **Product state** | Unauthenticated guest OK |
| **Crop / zoom** | Center header CTA; 1.1× on button |
| **Footage type** | **REAL UI** |
| **Selector** | `[data-testid="global-create-your-business"]` |

---

## Shot 3 — Performer intake

| Field | Value |
|-------|-------|
| **Duration** | 4s |
| **Route** | `/app?entry=performer&onboarding=1&newStore=1&starter=create_store&source=global_create_launcher` |
| **User action** | Wait for auto “Create a store…” message; type **`modernsecuritydoors.com.au`** (or Vietnam factory line) and send |
| **Visible text** | Composer placeholder; user message; assistant acknowledgment |
| **Product state** | `create_store` intake accepted |
| **Crop / zoom** | Tight on chat column + composer; hide side panels on mobile |
| **Footage type** | **REAL UI** |
| **VO (editor)** | “Tell me about your business.” |

---

## Shot 4 — Cardbey working (progress)

| Field | Value |
|-------|-------|
| **Duration** | 6s |
| **Route** | `/app` (Performer, mission running) |
| **User action** | Hold on progress; no clicks required |
| **Visible text** | Sequential labels: **Understanding your business** → **Finding your products & services** → **Learning your brand** → **Preparing your Cardbey presence** |
| **Product state** | Real pipeline running (`structured_store_build` in flight or completing) |
| **Crop / zoom** | Chat + execution activity strip; 1.15× on active step |
| **Footage type** | **REAL UI** (may speed 1.5× in edit; labels must match real stage) |
| **Note** | Record ~60–90s wall clock; use best 6s in post |

---

## Shot 5 — Draft reveal

| Field | Value |
|-------|-------|
| **Duration** | 6s |
| **Route** | `/app` execution panel and/or `/preview/website/:draftId` |
| **User action** | Open inline website preview or “Review draft” when ready |
| **Visible text** | Business name, hero, About, product/service cards, contact/location |
| **Product state** | Draft `ready`; Market Lane research catalog (≥8 offerings, no template) |
| **Crop / zoom** | Slow pan on hero → catalog grid; hide debug panels |
| **Footage type** | **REAL UI** |
| **Capture business** | Market Lane Coffee (`https://www.marketlane.com.au`, Melbourne) |

---

## Shot 6 — Result actions (optional)

| Field | Value |
|-------|-------|
| **Duration** | 4s |
| **Route** | Same as Shot 5 |
| **User action** | Only if production-ready CTA visible; otherwise skip |
| **Visible text** | “Review draft”, “Preview website”, or existing artifact actions |
| **Product state** | Post-build, checkpoint skipped |
| **Crop / zoom** | Button row close-up |
| **Footage type** | **REAL UI** if available; else **POST-PRODUCTION OVERLAY** for Publish / Improve with AI / Share |

---

## Shot 7 — Brand close

| Field | Value |
|-------|-------|
| **Duration** | 2s |
| **Route** | N/A |
| **User action** | None |
| **Visible text** | Cardbey logo / tagline (editor asset) |
| **Product state** | N/A |
| **Crop / zoom** | Full frame |
| **Footage type** | **POST-PRODUCTION OVERLAY** |

---

## Duration tally

| Shot | Seconds |
|------|---------|
| 1 Problem | 3 |
| 2 Global Front | 3 |
| 3 Intake | 4 |
| 4 Progress | 6 |
| 5 Draft reveal | 6 |
| 6 Actions | 4 |
| 7 Brand close | 2 |
| **Total** | **28** |

---

## Recording order (efficient)

1. Run `node scripts/v1-promo-capture-check.mjs --full` until PASS.
2. Record Shot 2 → 3 → start mission.
3. While mission runs (~90s), capture long take for Shot 4.
4. When draft ready, record Shots 5–6 (Market Lane path).
5. Shots 1 and 7 in video editor only.

---

## Do-not-show checklist

- [ ] `Mission 001` / mission IDs in debug header
- [ ] `structured_store_build` tool names
- [ ] `catalogSource` / research debugger panels
- [ ] Template or placeholder catalog items
- [ ] Sign-in wall interrupting create flow
