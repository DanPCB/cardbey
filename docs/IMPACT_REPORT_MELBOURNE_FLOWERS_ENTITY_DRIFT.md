# Impact Report: Melbourne Flowers Wrong-Entity + Service Drift

## What could break
- Soft-select may refuse more Places hits → more NEW_BUSINESS starters instead of researched catalogs (intended when match is weak).
- User display name stays as typed even when a nearby Place is researched for facts only.
- Florist/plural “flowers” catalogs shift from Book → Order/Enquire.

## Why
1. `name-partial` substring (`melbourne-flowers` ⊂ `port-melbourne-flowers`) + empty distinctive tokens still soft-selected Port Melbourne Flowers.
2. Pipeline set `businessName = selected.name`.
3. `\bflower\b` missed plural `flowers` → service_fixed_booking + Book CTA.

## Impact scope
Entity resolution, research pipeline identity, retail classify, catalog enrich CTA.

## Smallest safe patch
1. Soft-select only with exact name or distinctive brand token corroboration; empty shared → refuse.
2. Never overwrite input `businessName` with selected candidate unless name-exact / strong brand match.
3. Retail/CTA regexes include `flowers?|blooms?|bouquets?`.
4. BookingServiceNormalizer skip product_retail / florist.
