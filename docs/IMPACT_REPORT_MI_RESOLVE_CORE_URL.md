# Impact Report: MI Resolve 404 + Effective Core URL Fix

**Date:** 2026-02-14  
**Scope:** Core `/api/mi/resolve` 404 fix + Dashboard "Effective Core URL: Not configured" fix.  
**Locked rule:** No changes to store creation spine (Quick Create → Draft Review → Publish → Live).

---

## 1) Risk assessment (store creation spine unchanged)

- **Store creation spine:** Not modified. No changes to:
  - `POST /api/mi/orchestra/start`
  - `GET /api/stores/temp/draft`
  - `PATCH /api/draft-store/:draftId`
  - `POST /api/store/publish`
  - `GET /api/store/:id/preview`
- **Core:** One additive route only: `POST /api/mi/resolve` (stub 501). No existing routes or request/response shapes changed.
- **Dashboard:** Additive helpers and display logic only; persistence already used `setStoredCoreUrl` / `setCoreApiBaseUrl`. No changes to API client request/response or store-creation flows.

---

## 2) File list + diffs summary

### Core (cardbey-core)

| File | Change |
|------|--------|
| `src/routes/miRoutes.js` | Added `router.post('/resolve', ...)` returning 501 JSON `{ ok: false, error: 'MI resolve not configured', hint: '...', route: '/api/mi/resolve' }`. |
| `tests/mi.resolve.routes.test.js` | **New.** Two tests: POST /api/mi/resolve returns non-404 + JSON; returns 501 with error and route. |

### Dashboard (cardbey-marketing-dashboard)

| File | Change |
|------|--------|
| `src/lib/getCoreApiBaseUrl.ts` | Added `getEffectiveCoreUrlDisplayString()` (proxy mode → "Proxy mode: /api → {stored or 127.0.0.1:3001}"; else effective or stored URL). Added `isEffectiveCoreUrlConfigured()`. |
| `src/components/SetCoreUrl.tsx` | Use `getEffectiveCoreUrlDisplayString()` for Effective Core URL line; Save calls `setStoredCoreUrl(next)` then `setCoreApiBaseUrl(next)` for single source of truth. |
| `tests/coreUrlSettings.test.tsx` | **New.** Persistence, validation (127.0.0.1/localhost for Force Local), proxy-mode display (Effective not "Not configured"). |

---

## 3) Test commands + results

**Core:**

```bash
cd apps/core/cardbey-core
npx vitest run tests/mi.resolve.routes.test.js --testTimeout=60000
```

- Result: 2 tests passed (non-404 + JSON; 501 with error/route).

**Dashboard:**

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run tests/coreUrlSettings.test.tsx
```

- Result: 8 tests passed (persistence, validation, Effective display in proxy mode).

---

## 4) Manual verification checklist

1. **Core on :3001, dashboard on :5174 (Vite proxy):**
   - Core: `npm run dev` (or equivalent) in `apps/core/cardbey-core`.
   - Dashboard: `npm run dev` in `apps/dashboard/cardbey-marketing-dashboard` (proxy to 127.0.0.1:3001).

2. **Set Core URL modal:**
   - Open Set Core URL (Ctrl+K).
   - Force Local + `http://127.0.0.1:3001` → Save.
   - Effective Core URL shows either "Proxy mode: /api → http://127.0.0.1:3001" (or stored URL) or the stored URL — not "Not configured".
   - Reload page; reopen modal — Effective still configured (proxy or stored URL).

3. **POST /api/mi/resolve:**
   - Trigger any flow that calls `POST /api/mi/resolve` (e.g. MI resolve from dashboard).
   - In Network tab: response is 501 (or 200/400 when implemented) with JSON body, not 404.

4. **Spine unchanged:**
   - Quick Create → Draft Review → Publish → Live still works; no changes to orchestra/start, temp/draft, draft-store PATCH, store/publish, store preview.

---

## 5) Rollback plan

- **Core:** Remove the `router.post('/resolve', ...)` block from `src/routes/miRoutes.js` and delete `tests/mi.resolve.routes.test.js`. `/api/mi/resolve` will return 404 again until re-added.
- **Dashboard:** Revert `getCoreApiBaseUrl.ts` (remove `getEffectiveCoreUrlDisplayString` and `isEffectiveCoreUrlConfigured`), revert `SetCoreUrl.tsx` to previous Effective line and Save logic, delete `tests/coreUrlSettings.test.tsx`. No DB or API contract changes to roll back.
