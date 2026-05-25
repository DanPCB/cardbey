# Real capability execution rollout (Phase 8)

Phase 8 enables **one** real client-side capability: `replace_catalog` (`update_product_catalog`). All other capabilities remain **dry-run / advisory only**.

## Why only replace_catalog?

- Uses existing, user-confirmed menu upload flow (`MenuUploadModal` → `replaceDraftCatalogFromMenuItems`)
- No silent mutation — execution runs only after **Use extracted menu items**
- Same API path as Phase 3 artifact actions (no new Core execute route in this phase)
- Lowest risk to store draft, preview refresh, and inspector state

## Flow

```
Next-step: Update product catalog
  → menu_replace_open (unchanged — opens modal)
  → user uploads menu → reviews extracted items
  → [flag ON] executeReplaceCatalogCapability
      → lifecycle: requested → running → completed | failed
      → replaceDraftCatalogFromMenuItems
      → preview reload nonce bump
  → other capabilities: dry-run + readiness cards only (Phase 6–7)
```

## Feature flag

| Env | Default | Effect |
|-----|---------|--------|
| `VITE_PERFORMER_EXECUTION_REAL_CAPABILITIES` | **OFF** | Phase 7 behavior (dispatch/artifact path for catalog apply) |
| `=1` | — | Modal confirm uses `executeReplaceCatalogCapability` |

Independent flags:

- `VITE_PERFORMER_EXECUTION_SERVER_BRIDGE` — dry-run validation (unchanged)
- `VITE_PERFORMER_EXECUTION_INTENTS` — intent envelope (unchanged)

## Allowlist

File: `realCapabilityAllowlist.ts`

```ts
['replace_catalog']
```

`executeCapabilityPlan()` returns `advisory_only` / `awaiting_user_confirmation` for other capability IDs.

## Rollback

Unset `VITE_PERFORMER_EXECUTION_REAL_CAPABILITIES`. Catalog apply reverts to `dispatchPerformerArtifactAction` (`menu_use_extracted_items`) or legacy API when unified actions are off.

## Lifecycle stream

Events use `actionType: menu_use_extracted_items`, `source: runtime`, lifecycles `requested` | `running` | `completed` | `failed`. Shown in the artifact action stream timeline (same dedupe rules as Phase 3).

## Adding the next capability safely

1. Prove dry-run reports capability as available in target environment.
2. Add capability id to `REAL_CAPABILITY_ALLOWLIST`.
3. Implement a dedicated executor function (do not broaden `executeRuntimeAction` on Core yet).
4. Require explicit user confirmation where state changes.
5. Emit artifact lifecycle rows and add contract tests.
6. Enable in staging with the flag before default-on.

## Related docs

- [EXECUTION_CAPABILITY_SKILL_MODEL.md](./EXECUTION_CAPABILITY_SKILL_MODEL.md)
- [EXECUTION_RUNTIME_SERVER_BRIDGE.md](./EXECUTION_RUNTIME_SERVER_BRIDGE.md)
