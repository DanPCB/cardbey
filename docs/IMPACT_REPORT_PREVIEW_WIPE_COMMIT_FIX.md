# Impact Report: Draft preview wipe on content resolution + empty commit

**Date:** 2026-05-20  
**Scope:** `runContentResolution`, `commitDraft`, `missionBlackboard.appendEvent`, generateDraft logging

## Problem

Production mission logs showed 24/24 images in `finalizeDraft`, then `[generateDraft] done { items: 0 }`, `itemsCreated=0`, and `analyze_store` → "Store has 0 products without images."

## Root cause

1. `runContentResolution` wrote `preview: { update: { slogan, heroText, tagline } }` via Prisma. When that update succeeded, it replaced the full preview JSON and **deleted `items` / `categories`**.
2. `commitDraft` read `draft.preview` without `parseDraftJsonField`, then `deleteMany` products and created **0** rows on the user's existing business.

## What could break

| Change | Risk | Mitigation |
|--------|------|------------|
| Content resolution merge-only | Low | Same fields updated; catalog preserved |
| Commit refuses 0 items | Medium | Missions with intentionally empty catalog will fail commit with clear error instead of wiping store |
| Blackboard retry on P2002 | Low | Retries seq allocation only |

## Smallest safe patch

1. `runContentResolution`: always read-merge-write preview using `parseDraftJsonField`.
2. `commitDraft`: parse preview/input with `parseDraftJsonField`; throw if no commit items (do not wipe products).
3. `appendEvent`: retry on unique `(missionId, seq)` collision (up to 3 attempts).
4. `generateDraft` done log: count items via parsed preview.

## Areas not changed

- SSE, intake routing, vertical classifier, Anthropic model env (separate ops fix).
