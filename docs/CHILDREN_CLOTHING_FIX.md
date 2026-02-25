# Children Clothing — Before/After Fix

Minimal end-to-end changes to fix vertical/intent detection and catalog for "Children Clothing" and free-account item count.

## Before (failing case)

- **Input:** businessName = (e.g. "Yahoo" or generic), businessType = "Children Clothing"
- **Problem:** Vertical could be driven by businessName (e.g. generic/store) or wrong fashion branch; template was adult fashion_boutique; items included adult product names.
- **Resolved verticalSlug:** sometimes wrong (e.g. retail.generic or fashion.boutique)
- **templateId:** fashion_boutique
- **itemCount:** could be &lt; 24
- **Sample items:** adult-focused (e.g. men's shirt, women's heels, leather boots)

## After (acceptance met)

- **Input:** businessName = any, businessType = "Children Clothing"
- **Resolved verticalSlug:** `fashion.kids` (businessType weighted 3×, name 1×; "children" + "clothing" lock fashion.kids).
- **Resolved audience:** `kids` (from resolveAudience).
- **templateId:** `fashion_kids` (selectTemplateId(verticalSlug, audience) when fashion.* and audience === 'kids').
- **itemCount:** 30 (fashion_kids template has 30 items; other templates expanded to 24–30 via expandTemplateItems when &lt; 24).
- **Sample of 10 items (no adult items):** Kids T-Shirt, Toddler Top, Kids Long Sleeve Tee, Children Polo Shirt, Kids Shorts, Toddler Leggings, Kids Jeans, Toddler Hoodie, Kids Zip Hoodie, Kids Sneakers.

## Changes (summary)

1. **Vertical resolution (businessType primary)**  
   `verticalTaxonomy.js`: score = matchScoreType×3 + matchScoreName×1; if businessType has ≥2 matches or type score ≥3, lock to type-based winner. Added `fashion.kids` vertical and `resolveAudience()`.

2. **Template selection**  
   `selectTemplateId(verticalSlug, audience)`: when fashion.* and audience === 'kids' → `fashion_kids`. Orchestra start computes audience and passes it; baseInput stores `audience`.

3. **fashion_kids template**  
   `structuredTemplates.js` + `templateItemsData.js`: TEMPLATE_FASHION_KIDS with 30 kids-only items (Tops, Bottoms, Outerwear, Shoes, Accessories, Baby Basics, School Essentials).

4. **~30 items for free/template**  
   `templateItemsData.js`: `expandTemplateItems(key, 30)`; `buildFromTemplate` uses it when list.length &lt; 24; cap 30 items (min 24, max 36).

5. **Kids validator (corrective)**  
   After build in `buildCatalog`: if audience === 'kids', scan products for forbidden adult keywords; if ≥2 hits or &gt;10% flagged → rebuild with `buildFromTemplate(..., templateId: 'fashion_kids')`.

6. **AI path**  
   `generateVerticalLockedMenu` accepts `audience`; when audience === 'kids', prompt adds kids-only constraint and ~30 items. Same validator applies to AI output.

7. **Classify-business**  
   Prompt updated: businessType primary; example "Children Clothing" → fashion.kids.

## Acceptance

- **A)** businessType = "Children Clothing" → items are kids-focused; no men's dress shirt, women's heels, adult leather boots.
- **B)** Item count ~30 (24–36) for free users (template and AI).
- **C)** businessType overrides businessName for vertical classification (weight 3 vs 1, type lock).
- **D)** Works for both AI path and template fallback (validator forces fashion_kids when needed).
