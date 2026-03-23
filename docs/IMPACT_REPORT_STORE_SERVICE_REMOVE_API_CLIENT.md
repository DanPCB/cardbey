## Impact Report: Remove `@cardbey/api-client` from `src/services/store.ts`

### What could break
1. Store creation could fail if `POST /api/stores` response shape differs from assumptions (`{ store }` vs direct object).
2. Error mapping could change slightly if status/details are not preserved.

### Why
Render build fails with unresolved import:
`@cardbey/api-client` from `src/services/store.ts`.

Standalone dashboard deploy cannot resolve workspace-only package imports.

### Impact scope
- `apps/dashboard/cardbey-marketing-dashboard/src/services/store.ts`

### Smallest safe patch
1. Remove `@cardbey/api-client` imports.
2. Keep exported `CreateStorePayload`/`Store` types locally in this file.
3. Replace `apiCreateStore(...)` with local `fetch('/api/stores', { method: 'POST' ... })`.
4. Preserve auth token lookup and `status/details` error mapping.

### Verification
- Run `pnpm run build:dashboard` after patch.

