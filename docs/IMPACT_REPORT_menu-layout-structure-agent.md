# Impact Report — Menu layout structure specialist agent

**Date:** 2026-07-18  
**Scope:** Menu import image extraction (Core)  
**Goal:** Add a specialist agent that reads visual layout (columns, bands, section boxes) before item extraction, improving both structured Menu Document organization and visual section overlays.

## What could break

1. Extra OpenAI vision call latency/cost on menu image import.
2. Bad layout JSON could bias category assignment if hints are wrong.
3. Section order changes when layout reading-order is applied.

## Why

Current extraction is layout-agnostic GPT-4o item listing. Multi-column boards (e.g. RELAXATION | DEEP TISSUE + full-width DOUBLE) need an explicit structure pass so columns with different prices are not merged and section order matches the page.

## Impact scope

- New: `menuLayoutStructureAgent.js` (layout-only vision specialist)
- Wire: `extractMenuFromFile` → layout then extract; soft-fail to existing path
- Enrich: `menuVisionExtract` prompt with layout hints; fix separate-price column rule
- Additive: `menuDocument.layout` + `publicJobView` via existing `menuDocument`
- Env kill-switch: `MENU_LAYOUT_STRUCTURE_AGENT=0`

## Smallest safe patch

Wrap-only: one specialist call + hint injection. No new routes, no catalog-apply change, no topology rewrite. Layout failure never fails the job.

## No-parallel-stack proof

Reuses menu-import job, vision extract, Menu Document, and review path. Does not replace DocumentTopology loyalty grid or invent a second menu pipeline.
