# IMPACT REPORT — AWE Financial + systemic enrichment pipeline

Date: 2026-08-26  
Reference: `https://cardbey.com/s/awe-financial` (Leo Nguyen / finance broker, Footscray)  
Related prior work: `ERROR_REPORT_AWE_FINANCIAL_STOREFRONT_FIDELITY.md` (Patches A–C; live not applied)

## Diagnose (Step 1)

### Live website (2026-08-26 probe)
`https://awefinancial.com.au` currently renders as a **GoDaddy builder stub** (“Unlocking Potential, Together” + Contact form). Probe: `og:image` = Getty stock (`wsimg.com/isteam/getty/…`); **no** mailto/tel/Barkly/Leo/brochure signals on homepage. Therefore:

- Website-only re-enrichment may still miss phone/email/address/person.
- Live store repair must use **confirmed brochure fields** (governed script), not scrape alone.
- Prefer `og:image` when branded; otherwise finance-specific Pexels ladder.

### Code gaps (vs this prompt)

| Item | Status |
|------|--------|
| `financial-planning` subcategory | Exists (thin aliases) |
| `mortgage-broker` subcategory | **Missing** — `broker` can match **Insurance** first |
| Contact page fetch after thin homepage | **Missing** |
| AU address on `WebsiteExtract` | **Missing** |
| Person/staff extract | **Missing** |
| Finance/consultation image mismatch guards | **Missing** (tests expect them; pressure-washing only has truck reject) |
| Mortgage/finance hero query ladder | **Missing** |
| Live repair script | Exists dry-run; **does not** clear consultation product images or set brochure contact |

### Prior patches still valid
A–C (About prompt leak, non-geo location, empty Shows) remain the right storefront normalize guards. This work extends **enrichment taxonomy + extract + media** and prepares governed live repair.

## (1) What could break

- New Professional stores resolve to `mortgage-broker` / richer `financial-planning` instead of Insurance or Other → different hero/catalog ladders.
- Contact-page fetches add latency/budget use (must respect enrichment fetch budget).
- Image mismatch guards reject more stock photos for consultations/finance → more null images until a better hit.
- Live `--apply` mutates public Business fields (high-impact; confirmation required).

## (2) Why

Wrong category → generic “Footscray storefront” Pexels → street sweeper. Nav/CTA + blueprint consultation scaffold → “Book our consultations” + bad image. Thin homepage / bilingual slogan → missing contact and polluted location (partially fixed by Patch B).

## (3) Impact scope

- `categoryTaxonomy.ts`, `heroSearchQueries.ts`, `webExtractors.ts` (+ tests)
- `serviceImageMismatchGuards.js` (+ existing serviceImageResolver tests)
- `repair-awe-financial-storefront.mjs` (brochure fields; still gated)
- No auth/billing/claim changes. No auto-publish.

## (4) Smallest safe patch (this slice)

1. Add `mortgage-broker` + expand `financial-planning` aliases; ensure finance-broker signals beat Insurance `broker`.
2. Add homepage-follow contact paths + `extractAddress` on `WebsiteExtract` (budget-capped).
3. Add consultation / finance / professional reject terms for truck/municipal imagery.
4. Add mortgage-broker / financial-planning hero query templates + infer tokens.
5. Extend repair script with brochure contact/services **behind existing confirm gate**; do not run `--apply` without operator confirm.
6. Unit tests for taxonomy, address, nav, image reject.

**Deferred (needs confirm or thicker scrape):** person extraction heuristics, full bilingual body pipeline, production `--apply` + republish.

## Operator checkpoint

- Systemic code: proceed after this report.
- Live AWE DB apply: **await `CARDBEY_CONFIRM_LIVE_REPAIR=1` + explicit confirm**.
