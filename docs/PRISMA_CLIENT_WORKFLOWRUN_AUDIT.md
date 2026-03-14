# Prisma client audit: single instance with WorkflowRun

## 1. PrismaClient import inventory (source + tests; excluding node_modules)

| File path | Exact import line | From module |
|-----------|-------------------|-------------|
| `apps/core/cardbey-core/src/lib/prisma.js` | `import { PrismaClient } from '../../node_modules/.prisma/client-gen/index.js';` | `../../node_modules/.prisma/client-gen/index.js` |
| `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | `import { prisma } from '../../lib/prisma.js';` | `../../lib/prisma.js` (re-exports client-gen instance) |
| `apps/core/cardbey-core/src/routes/miRoutes.js` | `import { prisma } from '../lib/prisma.js';` | `../lib/prisma.js` |
| `apps/core/cardbey-core/src/services/menuVisualAgent/menuVisualAgent.ts` | `import { prisma } from '../../lib/prisma.js';` | `../../lib/prisma.js` |
| `apps/core/cardbey-core/src/kernel/transitions/transitionService.test.js` | `import { prisma } from '../../lib/prisma.js';` | `../../lib/prisma.js` |
| `tests/gold_flows/test-helpers.js` | `import { prisma } from '../../apps/core/cardbey-core/src/lib/prisma.js';` + `export { prisma };` | core `lib/prisma.js` ✅ |
| `tests/gold_flows/menu_extraction_flow.test.js` | `import { ..., prisma } from './test-helpers.js';` | test-helpers (→ core lib) ✅ |
| `tests/gold_flows/pairing_flow.test.js` | `import { prisma } from './test-helpers.js';` | test-helpers (→ core lib) ✅ |
| `tests/gold_flows/upload_preview_flow.test.js` | `import { ..., prisma } from './test-helpers.js';` | test-helpers (→ core lib) ✅ |
| `tests/gold_flows/auth_flow.test.js` | `import { ..., prisma } from './test-helpers.js';` | test-helpers (→ core lib) ✅ |
| `tests/gold_flows/playlist_sync_flow.test.js` | `import { ..., prisma } from './test-helpers.js';` | test-helpers (→ core lib) ✅ |

JSDoc-only references (no runtime import): `transitionService.js`, `draftStoreService.js` — use `import('@prisma/client').PrismaClient` in comments only; no change needed.

---

## 2. Schema that defines WorkflowRun and its generator

**Schema file:** `apps/core/cardbey-core/prisma/sqlite/schema.prisma`

**Generator block:**

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../node_modules/.prisma/client-gen"
}
```

**WorkflowRun model** (excerpt): around line 1842 in that schema:

```prisma
model WorkflowRun {
  id            String    @id @default(cuid())
  workflowKey   String
  draftStoreId  String?
  startedAt     DateTime  @default(now())
  endedAt       DateTime?
  status        String
  failureCode   String?
  ...
}
```

The client that includes WorkflowRun is generated into **`apps/core/cardbey-core/node_modules/.prisma/client-gen`**. The default `@prisma/client` in that package resolves to `.prisma/client`, which is **not** the same as `client-gen`, so any code using `@prisma/client` may get a client without WorkflowRun.

---

## 3. Cross-check: who uses the correct client?

- **Core app (draftStoreService + build-store path):** All use `lib/prisma.js`, which imports from `client-gen` and creates a single `new PrismaClient()`. So the instance used by draftStoreService and the build-store path is the one that includes WorkflowRun. ✅
- **Tests under core:** `transitionService.test.js` uses `lib/prisma.js`. ✅
- **Tests under repo root (`tests/gold_flows/`):** Updated to use `prisma` from `test-helpers.js`, which imports from core `lib/prisma.js`. ✅

---

## 4. Dev-time sanity check

Added in **`apps/core/cardbey-core/src/lib/prisma.js`** (next to the module-level Prisma instance used by draftStoreService and the build-store path):

```js
if (process.env.NODE_ENV !== 'production') {
  console.log('[Prisma sanity] workflowRun delegate:', typeof prisma.workflowRun?.findFirst);
  ...
}
```

When the app runs in dev, you should see:

```text
[Prisma sanity] workflowRun delegate: function
```

If you see `undefined`, the app is not using the client generated from the schema that defines WorkflowRun.

---

## 5. Short report summary

### Authoritative schema and generator

- **Schema file:** `apps/core/cardbey-core/prisma/sqlite/schema.prisma`
- **Generator:** `provider = "prisma-client-js"`, `output = "../../node_modules/.prisma/client-gen"`
- **Generate command:**  
  `npx prisma generate --schema prisma/sqlite/schema.prisma`  
  (run from `apps/core/cardbey-core`)

### Canonical import for app code

- **Do not use** `import { PrismaClient } from '@prisma/client';` for the app’s single instance (that can resolve to a client without WorkflowRun).
- **Do use** the shared instance everywhere in the core app:
  ```js
  import { prisma, PrismaClient } from '../lib/prisma.js';   // path relative to your file
  ```
  Only `lib/prisma.js` should import from the generated output:
  ```js
  import { PrismaClient } from '../../node_modules/.prisma/client-gen/index.js';
  ```
  So the **canonical import for all app code** is: **`import { prisma, PrismaClient } from '<path-to>/lib/prisma.js';`** (and use `prisma`; create a new `PrismaClient()` only if you need a second instance for a specific reason).

### Files updated (all now use canonical client)

| File | Change applied |
|------|----------------|
| `tests/gold_flows/test-helpers.js` | Imports `prisma` from `../../apps/core/cardbey-core/src/lib/prisma.js`, exports it. Removed `@prisma/client` and local `new PrismaClient()`. |
| `tests/gold_flows/auth_flow.test.js` | Imports `prisma` from `./test-helpers.js`; removed `PrismaClient` import and local `const prisma`. |
| `tests/gold_flows/menu_extraction_flow.test.js` | Same. |
| `tests/gold_flows/pairing_flow.test.js` | Imports `prisma` from `./test-helpers.js`; removed `PrismaClient` and local prisma. |
| `tests/gold_flows/upload_preview_flow.test.js` | Same. |
| `tests/gold_flows/playlist_sync_flow.test.js` | Same. |

If gold flows are run with `cwd` = `apps/core/cardbey-core`, the path in test-helpers would need to be `../../src/lib/prisma.js` instead of `../../apps/core/cardbey-core/src/lib/prisma.js`. Current paths assume tests run from repo root.
