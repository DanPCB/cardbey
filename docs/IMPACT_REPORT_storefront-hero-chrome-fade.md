# Impact Report: Fade storefront business detail off hero

## Goal

On mobile public storefront, the fixed business-detail identity (avatar + name + tagline) stays over the catalog after scrolling past the hero. Fade that identity out when leaving the hero and fade it back in when returning. Primary CTA stays sticky.

## What could break

1. **Identity hard to tap while half-faded** — `pointer-events: none` when nearly gone.
2. **IntersectionObserver missing** — identity stays fully visible (current behavior); no crash.
3. **Hero without `id="hero"`** — observer finds nothing; identity stays visible.

## Why

`StorefrontPersistentMobileChrome` is `position: fixed` and always opaque. Hero-inline identity is suppressed when mobile nav is active (`suppressMobileChrome`), so the fixed chrome is the only identity — and it never tracks scroll.

## Impact scope

- `WebsitePreviewPage.tsx` — `StorefrontPersistentMobileChrome` identity row only
- Mobile public/preview storefront with bottom nav (`showStorefrontMobileNav`)

## Smallest safe patch

Observe `#hero` with `IntersectionObserver` thresholds; map `intersectionRatio` → opacity on the identity row; leave CTA unchanged.

## No-parallel-stack proof

No new nav surface or Intent Runtime path — scroll-linked opacity on existing chrome only.
