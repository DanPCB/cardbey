# Impact Report: Service catalog category section headings (dev)

## Problem

Editing/preview mini-website shows per-category headings (Coffee, Non Coffee, Snacks). Published/service layout shows a flat “Book services” grid even when category pills exist — `CatalogSection` already passes `categories`, but `ServiceCatalog` ignored them.

## (1) What could break

- Stores that relied on a single “Book services” heading will see per-category titles when ≥1 category group exists.
- Wrong category id matching could empty a filtered pill view (mitigated by reusing `groupDraftItemsByCategory`).

## (2) Why

`useServiceCatalog` delegates to `ServiceCatalog`, which bucketed all bookable rows under one heading and did not accept/use `categories`.

## (3) Impact scope

- `ServiceCatalog.tsx`, `serviceCatalogTypes.ts`, `StorefrontCatalogGrid.tsx`
- Preview + published storefronts that use service catalog layout
- No publish/booking/API contract changes

## (4) Smallest safe patch

Group bookable/quote items with existing `groupDraftItemsByCategory` when categories are provided; fall back to “Book services” / “Request a quote” when absent.

## No-parallel-stack proof

Reuses `groupDraftItemsByCategory` only; no new catalog runtime.
