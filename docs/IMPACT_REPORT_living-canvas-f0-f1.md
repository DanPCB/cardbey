# Impact Report: Living Canvas F0 + F1

## Goal

Introduce the canonical public lens model, route resolver, shell slot contracts, and `GlobalPublicShell`, then host Marketplace (`/`), Discover (`/frontscreen`), and Creators (`/creators`) inside it **without** changing URLs, content models, or visible chrome.

## What could break

1. **Extra DOM wrapper** — `data-living-canvas` root around page bodies; risk of CSS that assumes direct child of AppShell. Mitigated: no layout classes that change height/overflow beyond passthrough body.
2. **Double chrome** — avoided: F1 does **not** hoist `PublicFeedChrome`; pages keep existing chrome.
3. **Creator Studio / Performer** — must stay unwrapped; resolver marks them `workspace`; App only wraps three canvas routes.
4. **Hidden overlay roots** — empty reserved nodes; `hidden` when unused so they do not affect layout.

## Why

F0 contracts enable F2 morph and F3 lenses without a parallel public product. F1 proves one host shell while preserving today’s page adapters.

## Impact scope

- `docs/contracts/LIVING_CANVAS_F0_CONTRACTS.md`
- `src/lib/livingCanvas/*`
- `src/components/livingCanvas/GlobalPublicShell.tsx`
- `App.jsx` route wrappers for `/`, `/frontscreen`, `/creators` only
- Tests for resolver + shell

## Smallest safe patch

Wrap only; no morph, no lens unification, no AI/Performer nav change, no Creator Studio change.

## No-parallel-stack proof

Descriptors + host shell only. Intent Runtime / Kernel / feed data paths unchanged. Pages remain adapters inside one shell.
