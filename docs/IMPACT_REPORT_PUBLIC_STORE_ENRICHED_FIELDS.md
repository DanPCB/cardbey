# Impact Report — Public /s/:slug show enriched contact & hours

## What could break
- Public store DTO shape (new optional fields: `hours`, `tradingHours`, `websiteUrl`, `email`)
- Unclaimed / claimed storefront contact section and business details sheet
- Seed → draft → publish path for ingested candidates
- Public GET `/api/public/stores/:slug` if candidate overlay mis-applies

## Why
Enrichment lives on **BusinessCandidate** (`openingHours`, phone, website, …). Publish never copies hours to `Business.tradingHours`; mapper omits hours; storefront reads **mini-website contact section** placeholders only. BI looks rich because it reads candidates, not the public DTO.

## Impact scope
- Core: `publicStoreMapper`, candidate→seed→publish contact/hours, public slug route overlay
- Dashboard: `WebsitePreviewPage` fallbacks for phone/hours/location/website

## Smallest safe patch (this change)
1. Map `tradingHours` → public `hours` string + top-level `websiteUrl`/`email`/`phone` from contact.
2. Overlay null Business fields from linked candidate by `storeId` on public slug fetch (fixes already-published Night Sky without republish).
3. Sync enriched phone/website/email onto seed.normalized; put hours into seed contact preview; allow `tradingHours` on publish.
4. Storefront: fallbacks from public DTO when section content is empty.

## Deferred (not in this patch)
Full Google-style `StoreInfoPanel` / photo strip / two-column layout — would still be empty without (1–4). Ship panel after data is visible in existing sheet + contact section.
