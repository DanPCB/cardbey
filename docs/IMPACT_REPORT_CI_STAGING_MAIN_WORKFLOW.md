# Impact Report — CI staging/main workflow alignment

**Date:** 2026-08-12  
**Scope:** GitHub Actions branch triggers only (no deploy secrets, no force-push)

## (1) What could break

- CI may run **more often** on `staging` pushes/PRs (expected).
- PRs targeting only obscure branches may no longer trigger some jobs if we restrict `pull_request.branches` (Tests / Foundation / Contract now target `staging` + `main`).

## (2) Why

Consolidation Directive 7: feature → staging → main. Existing workflows still favored `develop` / open PRs without staging on core test pushes.

## (3) Impact scope

- `.github/workflows/tests.yml`
- `.github/workflows/foundation-regression.yml`
- `.github/workflows/contract-tests.yml`
- `.github/workflows/truth-enforcement.yml`
- `.github/workflows/android.yml` (push staging)
- Docs: performer worktree = `cardbey-wt-store-gen-p2`

## (4) Smallest safe patch

- Add `staging` to push triggers alongside `main` (keep `develop` where present).
- Set `pull_request.branches: [staging, main]` on core quality gates.
- Leave `promotion-guard.yml` (main ← staging) and `promote.yml` unchanged.
- Do **not** hard-reset staging or change Render deploy bindings.
