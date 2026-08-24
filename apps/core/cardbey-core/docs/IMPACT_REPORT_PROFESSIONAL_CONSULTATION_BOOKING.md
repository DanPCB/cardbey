# Impact Report: Professional consultation booking when no price list

**Branch:** `fix/professional-consultation-booking-when-no-pricelist`  
**Symptom:** Anison Capital Group (and similar) show many booking rows with invented / junk prices (`$0.00`, `$4.00`) instead of a general consultation booking.

## What could break

1. Professional stores that previously showed multi-item blueprint fee schedules will instead show a single “Book our consultations” booking when no real price list evidence exists.
2. Research-extracted service lists without meaningful prices will collapse to the same consultation booking.
3. Accounting/legal name-only generation also follows consultation-only (until a priced menu is uploaded).

## Why

Blueprint and research paths invent or extract offerings with `fromPrice` / `$0` that the booking UI renders as money. There was no gate separating “real price list” from “general professional info.”

## Impact scope

- Core: `industryBlueprintRegistry`, seed catalog for professional, optional collapse after research/preload for professional verticals
- Dashboard: unchanged if core stops emitting fake prices (display already shows whatever price is present)

## Smallest safe patch

1. Detect meaningful price-list evidence (owner/research/OCR prices, or multiple positive prices).
2. Professional industry without evidence → single unpriced “Book our consultations” bookable item.
3. With evidence (scanned/uploaded menu with prices) → keep priced booking items unchanged.
4. Regression tests for Anison (no prices) vs priced preload.

## No-parallel-stack proof

Reuses industry blueprint registry + existing seed/consultation patterns. No new booking engine.
