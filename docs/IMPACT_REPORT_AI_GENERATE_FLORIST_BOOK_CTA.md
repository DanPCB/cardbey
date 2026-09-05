# Impact Report: AI Generate Florist Book CTA + Images

## What could break
- Research-backed service businesses may lose forced Book if vertical misclassified as retail.
- Reject-fallback rebuild replaces draft catalog (intended when user chose AI).

## Why
1. WebsitePreviewPage: `catalogSource===research` → force Book / service layout.
2. reject_fallback never rebuilt AI starters — scraped Dame/Hazel/SEO titles remained.
3. Sourced items skip stock image enrich → letter placeholders.

## Smallest safe patch
1. Preview: Book only for booking verticals; florist/product_retail → addToCart.
2. reject_fallback: replace catalog with `buildNewBusinessStarterCatalog`.
3. Starter items: stamp product + add_to_cart; suggested origin for image fill.
4. Enrich: never preserve scraped `book` on product_retail.
