# Starter Templates Seed - Summary

## Overview

Successfully seeded 3 starter CreativeTemplate records that are:
- ✅ Fully compatible with CreativeTemplate model
- ✅ Ready for SmartTemplatePicker (MI ranking)
- ✅ Ready for AI text filling using fields + aiContext
- ✅ Ready to be instantiated into Creative Engine canvas
- ✅ Support C-Net, Storefront, Social layouts

---

## Template Details

### 1. CNET Vertical Poster – Promo

**Template ID:** `cmizws93d0002jvu49m4u4gvq`

**Metadata:**
- **Name:** `CNET Vertical Poster – Promo`
- **Description:** Digital signage (vertical 9:16) for C-Net screens — big headline, image, CTA, business branding
- **Channels:** `["cnet_screen"]`
- **Role:** `generic`
- **Primary Intent:** `promo_poster`
- **Orientation:** `vertical`
- **Tags:** `["poster", "promo", "cnet", "vertical"]`
- **isSystem:** `true`
- **isActive:** `true`

**Slots (fields.slots):**
- `headline` (text, required, defaultValue: "Big Sale Today!")
- `subheadline` (text, defaultValue: "Up to 50% off selected items")
- `cta` (text, defaultValue: "Visit Us Now!")
- `businessName` (text, sourceKey: "business.name")
- `brandColor` (color, sourceKey: "business.primaryColor")

**AI Context:**
```json
{
  "tone": "energetic",
  "audience": "general_customers",
  "language": "en",
  "styleHints": ["bold", "high-contrast", "retail"]
}
```

**Canvas:**
- Design size: 1080x1920 (vertical 9:16)
- 4 text nodes with `meta.templateSlotId` mappings
- Background color: `#1a1a2e`

---

### 2. Storefront Promo Banner – Landscape

**Template ID:** `cmizws9450005jvu4bpd53v9n`

**Metadata:**
- **Name:** `Storefront Promo Banner – Landscape`
- **Description:** Promotional banner for storefront / web-store homepage. 16:9 landscape
- **Channels:** `["storefront", "web"]`
- **Role:** `generic`
- **Primary Intent:** `promo_banner`
- **Orientation:** `horizontal`
- **Tags:** `["banner", "promo", "storefront"]`
- **isSystem:** `true`
- **isActive:** `true`

**Slots (fields.slots):**
- `title` (text, defaultValue: "Special Offer This Week!")
- `description` (richtext, defaultValue: "Enjoy great deals on our best-selling products.")
- `cta` (text, defaultValue: "Shop Now")
- `brandColor` (color, sourceKey: "business.primaryColor")
- `businessName` (text, sourceKey: "business.name")

**AI Context:**
```json
{
  "tone": "friendly",
  "audience": "online_buyers",
  "language": "en",
  "styleHints": ["clean", "modern", "minimal"]
}
```

**Canvas:**
- Design size: 1920x1080 (horizontal 16:9)
- 3 text nodes + 1 rectangle background with slot mappings
- Background color: `#1a1a2e`

---

### 3. Social Square Promo

**Template ID:** `cmizws94u0008jvu4p5s2oaxn`

**Metadata:**
- **Name:** `Social Square Promo`
- **Description:** Perfect for Instagram / TikTok feed — bold headline + hero image + CTA
- **Channels:** `["social"]`
- **Role:** `generic`
- **Primary Intent:** `social_post`
- **Orientation:** `square`
- **Tags:** `["social", "square", "promo"]`
- **isSystem:** `true`
- **isActive:** `true`

**Slots (fields.slots):**
- `headline` (text, defaultValue: "New Arrival!")
- `subtitle` (text, defaultValue: "Check out our latest collection.")
- `cta` (text, defaultValue: "Learn More")
- `brandColor` (color, sourceKey: "business.primaryColor")
- `businessName` (text, sourceKey: "business.name")

**AI Context:**
```json
{
  "tone": "youthful",
  "audience": "social_media_users",
  "language": "en",
  "styleHints": ["trendy", "bold", "high_contrast"]
}
```

**Canvas:**
- Design size: 1080x1080 (square 1:1)
- 3 text nodes with slot mappings
- Background color: `#1a1a2e`

---

## Canvas Node → Slot Mapping

All templates follow the convention where text nodes have `meta.templateSlotId` matching the slot `id`:

**Example (CNET Vertical Poster):**
```json
{
  "id": "headlineNode",
  "kind": "text",
  "text": "{{headline}}",
  "meta": {
    "templateSlotId": "headline"
  }
}
```

When instantiated:
1. Backend resolves `slotValues` from business context + AI (if `autoFillText: true`)
2. Frontend applies `slotValues["headline"]` to `node.text` when loading content

---

## SmartTemplatePicker Filtering

Templates will appear in SmartTemplatePicker based on channel filter:

- **`?channel=cnet_screen`** → Shows "CNET Vertical Poster – Promo"
- **`?channel=storefront`** → Shows "Storefront Promo Banner – Landscape"
- **`?channel=social`** → Shows "Social Square Promo"

---

## Testing Checklist

- [x] Templates created with all required fields
- [x] Base Content records created with canvas JSON
- [x] MIEntity registered for each template
- [ ] Verify templates appear in SmartTemplatePicker with correct channel filters
- [ ] Test instantiation with `autoFillText: true`
- [ ] Verify slot values are applied to canvas nodes on load
- [ ] Test with different business contexts (name, logo, colors)

---

## Seed Script

**File:** `apps/core/cardbey-core/scripts/seedDevTemplates.ts`

**Usage:**
```bash
cd apps/core/cardbey-core
npx tsx scripts/seedDevTemplates.ts
```

**Features:**
- ✅ Idempotent: Updates existing templates if they already exist (by name)
- ✅ Creates base Content records with canvas JSON
- ✅ Registers MIEntity for SmartTemplatePicker ranking
- ✅ Uses first available user if admin doesn't exist

---

## Next Steps

1. **Test in SmartTemplatePicker:**
   - Open Creative Engine
   - Click "Templates" or use SmartTemplatePicker
   - Filter by channel (`cnet_screen`, `storefront`, `social`)
   - Verify templates appear with correct metadata

2. **Test Instantiation:**
   - Select a template
   - Click "Use Template"
   - Verify content loads in ContentsStudio
   - Verify slot values are auto-filled (if `autoFillText: true`)

3. **Test AI Text Filling:**
   - Instantiate template with `autoFillText: true`
   - Verify empty text slots are filled with AI-generated text
   - Check that business context (name, etc.) is resolved correctly

4. **Add Thumbnails:**
   - Generate preview images for each template
   - Update `thumbnailUrl` in CreativeTemplate records

---

## Files Modified

- **`apps/core/cardbey-core/scripts/seedDevTemplates.ts`**
  - Added `upsertTemplate()` helper function
  - Added 3 starter template definitions with full canvas JSON
  - Made seeding idempotent (updates existing templates)

---

## Template IDs Reference

```
1. CNET Vertical Poster – Promo:        cmizws93d0002jvu49m4u4gvq
2. Storefront Promo Banner – Landscape: cmizws9450005jvu4bpd53v9n
3. Social Square Promo:                 cmizws94u0008jvu4p5s2oaxn
```

