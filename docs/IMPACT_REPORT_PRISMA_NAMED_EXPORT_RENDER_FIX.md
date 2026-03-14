# Impact report: Prisma named export fix (Render deploy crash)

## Risk assessment (before code change)

**Could adding a named export `prisma` from `db/prisma.js` break existing DB access in core?**

- **No.** The file currently exports only **default** (the singleton) and **named functions** (`getPrismaClient`, `initializeDatabase`, etc.). No code was changed or removed; we only **added** a named export `prisma` that refers to the same singleton.
- **Existing patterns:** Code using `import prisma from '../db/prisma.js'` (default) or `import { getPrismaClient } from '../db/prisma.js'` continues to behave the same; the singleton is still created once and returned by `getPrismaClient()`.
- **Conclusion:** Smallest safe fix is to add the named export; no refactor of call sites required.

---

## Root cause

- **Symptom:** Render deploy crashes with  
  `SyntaxError: The requested module '../../db/prisma.js' does not provide an export named 'prisma'`  
  at `src/services/intentGraph/graphWriterService.js:6` (and similarly for any file that does `import { prisma } from '...db/prisma.js'`).
- **Cause:** `src/db/prisma.js` exposes the Prisma client only as the **default** export (`export default getPrismaClient();`). It does **not** export a **named** `prisma`. ESM `import { prisma } from '...'` requires a named export; without it, Node throws at load time, so the server never binds a port.

---

## Changed files

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/db/prisma.js` | Export the same singleton as both default and named `prisma` (one `getPrismaClient()` call, two exports). |

---

## Export style before / after

**Before:**

- Named exports: `assertCampaignModels`, `getPrismaClient`, `testDatabaseConnection`, `checkSchemaSync`, `initializeDatabase`, `disconnectDatabase`.
- Default export: `getPrismaClient()` (singleton instance).
- No named `prisma`.

**After:**

- Same named exports as above, plus **`prisma`** (same singleton instance as the default).
- Default export: unchanged (same singleton).
- Implementation: `const client = getPrismaClient(); export default client; export { client as prisma };` so the client is created once and both import styles work.

---

## Import sites of `db/prisma.js` (and one `lib/prisma.js`)

| File | Import | Style | Status |
|------|--------|--------|--------|
| `src/services/intentGraph/graphWriterService.js` | `import { prisma } from '../../db/prisma.js'` | Named `prisma` | **Fixed** by this change |
| `src/routes/intentGraphRoutes.js` | `import { prisma } from '../db/prisma.js'` | Named `prisma` | **Fixed** by this change |
| `src/server.js` | `import { initializeDatabase, testDatabaseConnection, getPrismaClient } from './db/prisma.js'` | Named (functions only) | Unchanged |
| `src/routes/draftStore.js` | `import { getPrismaClient } from '../db/prisma.js'` | Named `getPrismaClient` | Unchanged |
| `src/middleware/auth.js` | `import prisma from '../db/prisma.js'` | Default | Unchanged |
| `src/routes/miRoutes.js` | `import { getPrismaClient } from '../db/prisma.js'` and `import { prisma } from '../lib/prisma.js'` | Uses **lib/prisma.js** for `prisma`, db/prisma only for `getPrismaClient` | Unchanged (no change to lib) |

No other files in core import a named `prisma` from `db/prisma.js`; the only broken call sites were the two intent-graph files above.

---

## Manual redeploy verification steps

1. **Build and run core locally (ESM):**  
   From `apps/core/cardbey-core`:  
   `npm run build` (if any) then `npm start` (or `node --import tsx ./src/server.js`).  
   - Server should start and bind the port (e.g. 3001).  
   - No `SyntaxError` about `prisma` or missing export.

2. **Smoke request:**  
   After startup, call a route that uses the intent-graph (e.g. `POST /api/intent-graph/build` with a valid `draftId` if available) or any route that uses Prisma (e.g. health or auth).  
   - Should respond without runtime errors from Prisma.

3. **Render redeploy:**  
   Push the change and trigger a deploy on Render.  
   - Build and start should complete.  
   - Logs should show the service binding the port (no “No open ports detected”) and no `SyntaxError: ... does not provide an export named 'prisma'`.  
   - One optional check: hit a Core API endpoint (e.g. `/api/health` or `/api/auth/me` with a token) to confirm DB access works in production.

---

## Summary

- **Root cause:** `db/prisma.js` had no named export `prisma`; intent-graph (and any) code using `import { prisma } from '...db/prisma.js'` failed at module load on Render.  
- **Fix:** Export the same singleton as both default and named `prisma` in `db/prisma.js`.  
- **Scope:** One file changed; no call-site refactors; existing default and `getPrismaClient()` usage unchanged.  
- **Mixed imports:** Two files use named `prisma` from `db/prisma.js` (now fixed); one uses default; others use `getPrismaClient` or `lib/prisma.js`. All remain valid after the change.
