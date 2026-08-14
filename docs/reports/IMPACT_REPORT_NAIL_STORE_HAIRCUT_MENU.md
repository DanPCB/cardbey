# IMPACT REPORT — Nail store showing haircut menu

Date: 2026-08-14  
Scope: Store menu / content generation for beauty verticals (esp. nail salons)  
Status: **PATCH APPLIED** — generation fix; live store needs Replace menu / republish after deploy

---

## Symptom (live)

Store **ANGEL NAIL** shows haircut catalog / media tiles:

- Women's Haircut, Men's Haircut, Children's Haircut, Hair Colour  
- Hero/branding correctly nail-themed; menu is hair-salon blueprint content

---

## Root cause

1. **Shared template key** — `beauty.nails`, `beauty.hair_salon`, and `beauty.spa` all use `templateKey: 'beauty_salon'`.
2. **`getTemplateItems('beauty_salon')` expands `beauty.hair_salon`** → Women's Haircut, etc.
3. **`selectTemplateId('beauty.nails')` → `beauty_salon`** via `industrySlugToTemplateKey`, so template/AI-off generation loads hair items even when vertical is correctly `beauty.nails`.
4. A correct **`beauty_nails`** template already exists with manicure/pedicure items but is never selected for the nails blueprint.
5. Secondary: `beauty.nails` has **no `matchPatterns`**, so name-based routing is weaker than hair/spa; generic businessType `"Beauty"` / `"Beauty salon"` type-locks to `beauty.spa` and still lands on the hair template.

Reproduced locally:

| Profile | Blueprint key | `selectTemplateId` | Template items |
|---------|---------------|--------------------|----------------|
| ANGEL NAIL / Nail salon | `beauty.nails` | `beauty_salon` | Women's Haircut… |
| ANGEL NAIL / (empty type) | `beauty.nails` | `beauty_salon` | Women's Haircut… |
| `buildIndustryCatalog` for nails | — | — | Classic Manicure… (correct) |

So industry-catalog path is fine; **template-key path is wrong**.

---

## (1) What could break

| Risk | Severity |
|------|----------|
| Existing drafts/stores that already stored hair items keep wrong menus until Replace menu / rebuild | Medium (data; not code regression) |
| Hair salons that somehow depended on `beauty.nails` → `beauty_salon` (none expected) | Low |
| Spa stores still on `beauty_salon` continue to get hair items via template path | Medium (pre-existing; optional same-class fix) |
| Strong nail-name override misclassifies rare hybrid “nails & hair” names toward nails starter menu | Low |

---

## (2) Why

Catalog generation often uses `selectTemplateId(verticalSlug)` → `getTemplateItems(templateKey)`. Mapping all beauty verticals through one hair-backed key collapses nail (and spa) into haircut menus.

---

## (3) Impact scope

| Area | Change |
|------|--------|
| `industryBlueprints/beautyBlueprints.js` | Nails `templateKey` → `beauty_nails`; add nail `matchPatterns`; spa → dedicated key |
| `templateItemsData.js` | Wire `beauty_nails` / `beauty_spa` from industry blueprints; keep `beauty_salon` = hair |
| `industryBlueprintRegistry.js` | Prefer nail name signals before wrong slug / generic beauty patterns |
| Tests | Nail store must not receive haircut template items |
| Live ANGEL NAIL | Needs **Replace menu** (or equivalent rebuild) after deploy — no silent publish |

### Out of scope

- Auto-republishing live storefronts  
- Changing governance / publish flow  
- Full taxonomy rewrite of `resolveVertical` substring matching (`gel`⊂`angel`)

---

## (4) Smallest safe patch

1. Point `beauty.nails` → `beauty_nails` (existing template).  
2. Point `beauty.spa` → `beauty_spa` (new template entry from spa blueprint) so spa does not inherit haircuts.  
3. Keep `beauty_salon` = hair only.  
4. Early nail-name preference in `resolveIndustryBlueprintKey`.  
5. Unit tests for ANGEL NAIL / beauty.nails → manicure items, not haircuts.

---

## Confirmation checkpoint

User requested fix on live symptom. Patch applied (no auto-publish of existing stores).

**Live follow-up:** After core deploy, open ANGEL NAIL → **Replace menu** → confirm manicure/pedicure services → **Publish** (governed confirmation). Existing wrong catalog is stored data and will not change until regenerated.
