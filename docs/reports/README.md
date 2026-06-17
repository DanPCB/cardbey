# Generated audit reports

Timestamped reports from discovery cleanup tooling. **Not committed** — generated on each run.

| Prefix | Command |
|--------|---------|
| `DISCOVERY_DATA_AUDIT_*.md` | `pnpm audit:discovery` |
| `DISCOVERY_CLEANUP_DRY_RUN_*.md` | `pnpm cleanup:discovery:dry-run` |
| `DISCOVERY_CLEANUP_ROLLBACK_*.json` | `pnpm cleanup:discovery -- --apply` (rollback snapshot) |

Run on **Render staging shell** after deploy:

```bash
pnpm audit:discovery:readiness
pnpm cleanup:discovery:dry-run
```
