# Impact Report: Owner-input resume re-asks (attachment missingFields)

**Date:** 2026-07-09  
**Scope:** After Continue with reward/stamps, topology resumes then immediately re-pauses on `owner_input_requested`.

## Problem

Logs show: `owner_input_received` → `topology.resumed` → `node.resumed` → `owner_input_requested` again.

`executeInferRequirements` merges owner answers into the seed, then **unconditionally re-appends** `attachmentAnalysis.missingFields` (still `reward` / `stampThreshold` from the card scan). Seed already has values → should be satisfied → wrongly returns `needs_input` again.

## What could break

| Risk | Why | Scope |
|------|-----|--------|
| Still pausing when seed empty | We only skip analysis re-add when seed has the field | Loyalty infer/generate |
| Prefer analysis over owner | Unlikely — owner answers must win | Resume path |

## Smallest safe patch

1. In `executeInferRequirements` (and generate/validate if same pattern): only add analysis missing fields when the **seed still lacks** that value.
2. Prefer `input.ownerInput` / `context.ownerInput` when building seed.
3. Regression test: resume with reward+stamps → infer returns `ok`, not `needs_input`.

## Out of scope

- Changing attachment analysis storage
- UI changes
