# Impact Report — Runtime Ignore & Index Hygiene

**Date:** 2026-07-20  
**Status:** Approved next phase after Runtime Locator Phase 1  
**Parent:** [`RUNTIME_BOUNDARY_PLAN.md`](./RUNTIME_BOUNDARY_PLAN.md), [`IMPACT_REPORT_RUNTIME_LOCATOR_PHASE_1.md`](./IMPACT_REPORT_RUNTIME_LOCATOR_PHASE_1.md)  
**Scope:** Expand `.gitignore` and `git rm --cached` for approved runtime paths. Preserve files on disk.  
**Non-scope:** Writer cutover, path moves, `git clean`, worktree gitlink redesign beyond untracking, mixed `data/businessIngestion` fixtures, commits (unless requested separately).

---

## Intent

Stop Git from tracking runtime products that already have (or will get) Runtime Locator areas. This reduces working-tree noise without changing runtime behavior.

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Clone missing media | Someone relied on Git for uploads | Uploads were never a valid source of truth; local/R2 remain |
| CI expecting tracked JSONL | Unlikely; tests should not need committed events | Verify no CI step checks these paths into Git |
| Accidental delete on disk | Wrong `git rm` without `--cached` | **Only** `git rm --cached` / `-r --cached` |
| Untracking fixtures | Mixed trees | Do **not** touch `data/businessIngestion` fixtures, starter-packs, language-seed |

## Approved untrack list (preserve on disk)

| Path | Approx tracked | Area |
|------|---------------:|------|
| `apps/core/cardbey-core/uploads/**` | ~2117 | uploads |
| `apps/core/cardbey-core/logs/**` | 2 | logs |
| `apps/core/cardbey-core/self-audit-reports/**` | 13 | diagnostics |
| `apps/core/cardbey-core/patches.audit.json` | 1 | diagnostics |
| `apps/core/cardbey-core/data/platformActivity/**` | 1 | diagnostics |
| `apps/core/cardbey-core/src/.cache/**` | 2 | cache / diagnostics |
| `apps/core/cardbey-core/.cache/**` | if any | cache |
| `apps/core/cardbey-core/.development-runtime/**` | 1 | development |
| `.development-workspaces/**` (tracked artifacts / mistaken gitlinks) | ~33 | generatedArtifacts / tooling |

## Ignore expansions

Root + core `.gitignore` entries aligned with Runtime Boundary Plan (safety net only).

## Smallest safe approach

1. Expand ignore rules.  
2. `git rm -r --cached -- <paths>` only.  
3. Confirm files still exist on disk for uploads sample.  
4. Measure porcelain count before/after.  
5. Do not stage unrelated source WIP beyond ignore/untrack.

## Rollback

```text
git restore --staged -- <paths>
# or reset the hygiene commit if one was made
```

Files on disk are untouched by `--cached` removal.

## Success criteria

- [x] Large drop in unstaged upload ` D` noise (675 → 0 for uploads)  
- [x] Uploads and listed runtime paths no longer in `git ls-files`  
- [x] Files remain on disk (uploads still ~1600 files)  
- [x] No writer code changes  
- [x] Locator module unchanged  
- [ ] Dedicated commit of staged index removals + ignore expansions (clears VS Code staged `D ` count)
