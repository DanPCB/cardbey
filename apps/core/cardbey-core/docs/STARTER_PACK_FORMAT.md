# Starter Pack JSON Format

Starter packs are defined as JSON files under `data/starter-packs/*.json`. This allows building and editing packs without code and supports later automated sourcing.

## Schema

### Pack metadata (top-level)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessType` | string | Yes | Business type key (e.g. `cafe`, `nail_salon`). |
| `region` | string | Yes | Region code (e.g. `AU`, `VN`, `US`). |
| `version` | string | Yes | Pack version (e.g. `1.0`). |
| `currency` | string | No | Default currency code (e.g. `AUD`, `USD`). |
| `name` | string | Yes | Human-readable pack name. |
| `description` | string | No | Short description of the pack. |

### Categories

```json
"categories": [
  { "key": "hot_drinks", "label": "Hot Drinks", "sortOrder": 0 },
  { "key": "food", "label": "Food", "parentKey": null, "sortOrder": 1 }
]
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Unique key within the pack (e.g. `hot_drinks`). |
| `label` | string | Yes | Display label. |
| `parentKey` | string | No | Key of parent category for tree structure. |
| `sortOrder` | number | Yes | Order in list (lower first). |

### Items

Each item is a catalog item and its placement in the pack (category, order, featured).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `FOOD` \| `PRODUCT` \| `SERVICE`. |
| `canonicalName` | string | Yes | Canonical item name. |
| `shortDescription` | string | Yes | Short description. |
| `tags` | string[] | Yes | Tags (e.g. `["coffee", "milk"]`). |
| `categoryKey` | string | Yes | Key of the category this item belongs to in this pack. |
| `priceMin` | number | No | Suggested minimum price. |
| `priceMax` | number | No | Suggested maximum price. |
| `currency` | string | No | Override currency for this item. |
| `imagePrompt` | string | No | Prompt for image generation. |
| `imageKeywords` | string[] | No | Keywords for image search/generation. |
| `modifiersJson` | object | No | Modifiers (e.g. sizes, milk type, add-ons). |
| `featured` | boolean | No | Mark as featured in pack (default `false`). |
| `sortOrder` | number | No | Order within category (default `0`). |

Optional for coherence/validators:

- `businessTypeHints`: string[] – e.g. `["cafe"]` (can default from pack).
- `localeHints`: string[] – e.g. `["AU"]` (can default from pack).

## Full example: Cafe AU (data/starter-packs/cafe_au_v1.json)

```json
{
  "businessType": "cafe",
  "region": "AU",
  "version": "1.0",
  "currency": "AUD",
  "name": "Cafe Australia Starter",
  "description": "Starter menu for Australian cafes: coffee, cold drinks, pastries. Includes milk/size modifiers for coffee.",
  "categories": [
    { "key": "hot_drinks", "label": "Hot Drinks", "sortOrder": 0 },
    { "key": "cold_drinks", "label": "Cold Drinks", "sortOrder": 1 },
    { "key": "pastries", "label": "Pastries", "sortOrder": 2 }
  ],
  "items": [
    {
      "type": "FOOD",
      "canonicalName": "Flat White",
      "shortDescription": "Double shot, steamed milk",
      "tags": ["coffee", "milk"],
      "categoryKey": "hot_drinks",
      "priceMin": 4.5,
      "priceMax": 6,
      "imagePrompt": "Flat white coffee in a ceramic cup, latte art",
      "imageKeywords": ["coffee", "flat white", "latte art"],
      "modifiersJson": { "sizes": ["S", "M", "L"], "milk": ["full", "skim", "oat", "almond"] },
      "featured": true,
      "sortOrder": 0
    },
    {
      "type": "FOOD",
      "canonicalName": "Croissant",
      "shortDescription": "Butter croissant",
      "tags": ["pastry", "bakery"],
      "categoryKey": "pastries",
      "priceMin": 5,
      "priceMax": 7,
      "imageKeywords": ["croissant", "pastry"],
      "sortOrder": 0
    }
  ]
}
```

## Full example: Nail salon AU (data/starter-packs/nails_au_v1.json)

```json
{
  "businessType": "nail_salon",
  "region": "AU",
  "version": "1.0",
  "currency": "AUD",
  "name": "Nail Salon Australia Starter",
  "description": "Starter service menu for nail salons in Australia: manicure, pedicure, gel, add-ons. No images required by default.",
  "categories": [
    { "key": "manicure", "label": "Manicure", "sortOrder": 0 },
    { "key": "pedicure", "label": "Pedicure", "sortOrder": 1 },
    { "key": "gel", "label": "Gel", "sortOrder": 2 },
    { "key": "add_ons", "label": "Add-ons", "sortOrder": 3 }
  ],
  "items": [
    {
      "type": "SERVICE",
      "canonicalName": "Classic Manicure",
      "shortDescription": "Shape, cuticle care, polish",
      "tags": ["manicure", "polish"],
      "categoryKey": "manicure",
      "priceMin": 35,
      "priceMax": 50,
      "featured": true,
      "sortOrder": 0
    },
    {
      "type": "SERVICE",
      "canonicalName": "Nail Art",
      "shortDescription": "Design per nail",
      "tags": ["add-on", "art"],
      "categoryKey": "add_ons",
      "priceMin": 5,
      "priceMax": 15,
      "sortOrder": 0
    }
  ]
}
```

## Loading and importing

- **Parser/loader:** `src/lib/catalog/packLoader.ts` – validates required fields, normalizes category parent refs; returns `packMeta`, `categoriesNormalized`, `itemsNormalized`, `starterPackItemJoin` (Prisma-ready; no DB calls).
- **CLI import:** `scripts/packImport.ts` – reads all JSON in `data/starter-packs/*.json`, loads via packLoader, upserts with stable keys (pack = businessType+region+version+name; category = key; item = canonicalName+type). Use `--dry-run` for counts and zero DB writes. **Not imported by runtime app.**

## File location

- Packs: `data/starter-packs/*.json`
- Import is not referenced by the runtime app; run explicitly when you want to sync JSON → DB.

## Example command (import packs locally)

From the core app root (`apps/core/cardbey-core`):

```bash
# Dry run – validate and print counts, no DB writes
npx tsx scripts/packImport.ts --dry-run

# Import – upsert packs into the database
npx tsx scripts/packImport.ts
```
