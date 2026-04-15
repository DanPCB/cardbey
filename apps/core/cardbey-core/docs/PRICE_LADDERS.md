# Price Ladders

Price ladders define **market-plausible** min/max prices per business type, region, and category. They are used to fill in missing prices on items and to keep generated stores from having random or inconsistent pricing. **Not auto-applied**; use the resolver when building or validating packs.

## Format

JSON files under `data/price-ladders/*.json`:

```json
{
  "businessType": "cafe",
  "region": "AU",
  "currency": "AUD",
  "byCategoryKey": {
    "hot_drinks": { "min": 3.5, "max": 8 },
    "cold_drinks": { "min": 4, "max": 9 },
    "pastries": { "min": 4, "max": 14 },
    "food": { "min": 12, "max": 28 }
  },
  "defaults": { "min": 3, "max": 30 }
}
```

| Field | Description |
|-------|-------------|
| `businessType` | Business type key (e.g. `cafe`, `nail_salon`). |
| `region` | Region code (e.g. `AU`). |
| `currency` | Currency code (e.g. `AUD`). |
| `byCategoryKey` | Per-category min/max. Keys match pack category keys. |
| `defaults` | Fallback min/max when category has no entry. |

## Resolver

**`resolvePriceForItem(item, ladder)`** → `{ min, max, currency }`

- If the item already has both `suggestedPriceMin` and `suggestedPriceMax`, they are returned (with currency from item or ladder).
- Otherwise, the ladder is used: `item.categoryKey` or `item.defaultCategoryKey` is looked up in `byCategoryKey`; if missing, `defaults` is used.
- Returns `min`/`max` as numbers or `null` if still missing; `currency` from item or ladder.

Usage (no side effects):

```ts
import { resolvePriceForItem } from './src/lib/catalog/priceLadder.js';
import ladder from './data/price-ladders/cafe_au.json' assert { type: 'json' };

const resolved = resolvePriceForItem(
  { categoryKey: 'hot_drinks', suggestedPriceMin: null, suggestedPriceMax: null },
  ladder as PriceLadder
);
// => { min: 3.5, max: 8, currency: 'AUD' }
```

## Included ladders

- **`data/price-ladders/cafe_au.json`** – Cafe, AU: espresso/latte, cold drinks, pastries, food.
- **`data/price-ladders/nails_au.json`** – Nail salon, AU: manicure, pedicure, gel, add-ons.

These are utilities only; nothing in the runtime app applies them automatically.
