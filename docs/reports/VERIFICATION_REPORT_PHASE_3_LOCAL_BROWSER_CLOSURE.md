# Phase 3 local browser closure pass

**Auth:** `ACK PHASE_3_LOCAL_BROWSER_CLOSURE_PASS`  
**Verdict:** `PHASE_3_LOCAL_BROWSER_VERIFIED_STAGING_DEPLOYMENT_REQUIRED`

## Controlled environment

| Item | Value |
|------|--------|
| Core | `127.0.0.1:3031` (fresh; prior Phase-3 :3021/:3022/:5186/:5187 stopped) |
| Dashboard | `127.0.0.1:5191` |
| Flags (runtime) | Core + Vite bridge **ON** for pass only |
| Persistence | `prisma_content_edit_proposal` |
| Readiness | `READY_FOR_LOCAL` |
| Unrelated left alone | composition `:3012` / `:5185` |
| Checkpoint SHAs tested | parent `a4c1bc560` + dashboard `f933478d` (pre-corrective); corrective commits listed below |

Processes stopped cleanly after verification.

## Fixture

- Owner / other / platform_admin disposable accounts (`p3closure_*`)
- Store A florist + Assessment show; Store B cafe (cross-store)
- Draft `cmt2p0gy0000bjvysfd6gfe4p`
- **Cleanup:** hard-deleted stores, draft, users, proposals; prior soft-marked leftovers also deleted. Remaining named P3 fixtures: **none**.

## Closure 1 — Drawer persistence

**Save-control root cause (prior miss):** automation selector issue — inputs lacked `name`/`data-testid`; Save already existed as “Save changes”. Not missing / not viewport / not save-on-blur.

**Fixes:** accessible title/description, sticky action bar, `data-testid="show-edit-save"`, disabled hint (“No changes to save” / admin reason / saving), loading/success/error.

**Evidence:** edit → Save → reopen → reload persisted; same store/draft; `isActive=false`; mobile Save visible. Screenshots under `tmp/phase3-browser-evidence/screenshots-closure/c1-*`.

**Loop note:** Playwright briefly stuck clicking gallery through the open drawer backdrop after save (`Save` correctly disabled with “No changes to save”). Test now closes Cancel/Escape first; final suite **3/3 passed**.

## Closure 2 — Admin AoB

- Account Management → Edit Website panel used; admin-support banner confirmed.
- Reason required (Save disabled until reason ≥8 chars).
- Persist + audit: `store_shows_update`, admin actor, reason, fingerprints (no secrets).
- `entry=admin` alone insufficient for other user; cross-store exercised.
- **UI contract fixes:** platform admin may GET store draft + `/api/draft-store/:id`; ShowEditDrawer admin reason field; Core `admin_reason_required` on AoB show create/update.

## Closure 3 — Regressions

- Create-store entry without premature fork card: pass  
- Catalog tab / no raw `miJob.review.*`: pass  
- Preview/publish boundary (fixture inactive; Publish not completed): pass  

## Automated results

- Playwright closure: **3 passed** (`closure-playwright-final.log`)
- Vitest `ShowEditDrawer.test.tsx`: **2 passed** (earlier in pass)

## Corrective commits

(Created after this report if staging succeeds — see git log.)

## Confirmations

- Nothing pushed  
- BB Flowers / live data untouched  
- Committed defaults remain **OFF** (`parseBoolEnv(..., false)` / Vite twin default false)  
- Unrelated dirty trees in parent/dashboard left untouched  
