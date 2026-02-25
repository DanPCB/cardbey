# Root cause: Credits at Create + wrong vertical (coffee for Nails & Beauty)

## 1) User's AI budget/credits at Create time

**API:** `GET /api/billing/balance` returns `aiCreditsBalance`, `welcomeFullStoreRemaining` from `creditsService.getBalance(userId)` (User fields: `user.aiCreditsBalance`, `user.welcomeFullStoreRemaining`).

**Current behavior:**
- New users: `grantWelcomeBundleOnRegister(userId)` runs after signup (authService). It sets `welcomeFullStoreRemaining = WELCOME_BUNDLE_FULL_STORE_COUNT` (env, default 1) and only sets `aiCreditsBalance = TRIAL_AI_CREDITS` when **env TRIAL_AI_CREDITS > 0** (default 0). So **new users get 0 credits** unless env is set.
- **UI:** Create page uses `useQuickStartOptions({ checkCredits: true })` → `useBillingBalance()` → `creditsDisplay`, `welcomeDisplay`. When `credits === 0 && welcome === 0`, `aiMenuDisabled === true` and `useAiMenu` is forced OFF and not sent.

**Conclusion:** New users have 0 credits; UI disables "Use AI menu"; request goes as form without `menuFirstMode`.

---

## 2) Pipeline when credits were 0

**Orchestra start** (`miRoutes.js` handleOrchestraStart):
- `sourceType = bodyRequest.sourceType || (goal === 'build_store_from_template' ? 'template' : …) || 'form'`.
- `usePaidAiMenu = menuFirstMode === true || menuOnly === true || ignoreImages === true`.
- **Rule:** `if ((sourceType === 'form' || sourceType === 'voice') && !usePaidAiMenu) draftMode = 'template'`. So form/voice **without** AI menu → **template mode** (no credits).
- When `draftMode === 'template'`, templateId is derived: `validKeys = ['cafe', 'restaurant', 'bakery', 'florist']`, `matched = validKeys.find(k => bt.includes(k) || …)` → for "Nails and Beauty Services" **no match** → **`baseInput.templateId = matched || 'cafe'`** → **templateId = 'cafe'**.

**Draft run:** `runBuildStoreJob` → `buildCatalog(params)` (when USE_QUICK_START_TWO_MODES) or legacy `draftStoreService.generateDraftContent`. For **template** mode, `buildFromTemplate(params)` uses `templateId` → `getTemplateItems(key)` from `templateItemsData.js`, which has only **cafe, restaurant, bakery, florist**. So **cafe items (coffee, latte, etc.) are used**.

**Conclusion:** With 0 credits, form/voice uses **template** mode; templateId defaults to **cafe** for unmapped businessType (e.g. Nails and Beauty); generator runs **cafe template** → wrong vertical.

---

## 3) businessType/vertical passed into generator

**Request payload:** `baseInput` in miRoutes includes `businessType`, `storeType`, `vertical` from body (and bodyRequest). So **businessType is sent**.

**Usage:** In template mode, **templateId** (derived above) drives which template is used; **businessType does not override** the template key when it doesn’t match validKeys. So for "Nails and Beauty Services", businessType is present but **ignored for template selection** and cafe is used.

**Conclusion:** businessType/vertical are in the payload but templateId derivation **ignores** them for non-food verticals and falls back to **cafe**.

---

## 4) Fixes applied (minimal)

| Part | Change |
|------|--------|
| **Credits** | **welcomeFullStoreRemaining** is the free first-store mechanism. On register, `grantWelcomeBundleOnRegister` sets `welcomeFullStoreRemaining = 1` (or WELCOME_BUNDLE_FULL_STORE_COUNT). **aiCreditsBalance** is not used as "free credits"; only set when env `TRIAL_AI_CREDITS > 0`. |
| **Template mapping** | In orchestra start: map businessType containing "nail" or "beauty" (and not food) to **templateId = 'nail_salon'**; **never** set templateId = 'cafe' for nails/beauty. When (form/voice) && no menuFirstMode: **prefer AI** if `welcomeFullStoreRemaining > 0`, else template with vertical-correct templateId. When both balances 0, use template (vertical-correct) instead of failing with 402. |
| **nail_salon template** | Add **nail_salon** to `templateItemsData.js` and to `getTemplateProfile` / TEMPLATE_KEY_TO_TYPE so template mode can return nails/beauty items. |
| **Guard** | In `buildFromTemplate`: if overrides.explicitType (businessType) indicates nails/beauty and key === 'cafe', **override key to nail_salon** (prevent wrong template). |
| **Dev log** | When draftMode === 'template' and templateId was derived (not from bodyRequest.templateKey), log `[orchestra:start] using template fallback, templateId: <id>, businessType: <bt>`. |

---

## 5) DB fields and initialization point

- **Fields:** `User.aiCreditsBalance`, `User.welcomeFullStoreRemaining` (Prisma).
- **Initialization:** In `authService.registerWithEmailPassword`, after `prisma.user.create`, `grantWelcomeBundleOnRegister(user.id)` is called. It sets `welcomeFullStoreRemaining = 1` (or WELCOME_BUNDLE_FULL_STORE_COUNT). It sets `aiCreditsBalance = TRIAL_AI_CREDITS` only when env TRIAL_AI_CREDITS > 0 (default 0).
- **consumeWelcomeBundle:** Called in `withPaidAiBudget` (in `creditsService.js`) after successful paid AI work when `useBundle` is true (i.e. `welcomeFullStoreRemaining > 0`). Used by `generateDraftTwoModes` when mode === 'ai'.

---

## 6) Generation request: businessType + verticalSlug

- **Before:** baseInput already had `businessType`, `storeType`, `vertical`. TemplateId was derived from businessType but only for cafe/restaurant/bakery/florist; else **cafe**.
- **After:** templateId derivation maps nails/beauty → **nail_salon**; vertical/businessType are unchanged; buildFromTemplate and menu generation already receive businessType/vertical where used.

---

## 7) Before/after: Nails & Beauty categories

- **Before:** Template mode with templateId 'cafe' → categories/items: coffee, latte, cappuccino, pastry, etc.
- **After:** Template mode with templateId 'nail_salon' → categories: single or from getMenuCategoriesAndAssignments; items: Classic Manicure, Gel Manicure, Classic Pedicure, Gel Pedicure, Nail Art, Nail Repair, Lash Lift, Waxing, Facials, etc. (from nail_salon template in templateItemsData.js and legacy draftStoreService.js).

---

## 8) Deliverable checklist

- **DB fields:** `User.aiCreditsBalance`, `User.welcomeFullStoreRemaining`. Initialization in `grantWelcomeBundleOnRegister(userId)` (called from `authService.registerWithEmailPassword` after user create). New users get `aiCreditsBalance = 300` (or `TRIAL_AI_CREDITS` if set in env).
- **Credits API:** `GET /api/billing/balance` returns `aiCreditsBalance`, `welcomeFullStoreRemaining`. `GET /api/auth/me` returns full user (includes these fields if present on model).
- **Generation request:** baseInput already included `businessType`, `storeType`, `vertical`. TemplateId derivation now maps nails/beauty → `nail_salon` and never uses cafe for that vertical.
- **Nails & Beauty example:** See section 7 above.
