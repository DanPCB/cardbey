# IMPLEMENTATION REPORT — QuickCreate mobile width (v1)

## Verdict

**CARDBEY_QUICKCREATE_MOBILE_WIDTH_FIXED**

## Root cause

`AgentBubble` applied chat styling `max-w-[72%]` to the entire agent column, including `store_creation_draft` / `create_store` form cards. That left ~25–30% empty space on the right on mobile. Sidebar/hamburger were not contributing (fixed overlay / off-flow drawer).

## Component / CSS responsible

- **Primary:** `ConsoleCentreColumn.tsx` → `AgentBubble` wrapper `max-w-[72%]`
- **Secondary:** `CreateStoreCardPlaceholder` lacked `w-full` (draft card already had it)

## Files changed

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/ConsoleCentreColumn.tsx` | Wide wrapper for create-store form types; `w-full` on legacy create-store card |
| `docs/reports/IMPACT_REPORT_QUICKCREATE_MOBILE_WIDTH_V1.md` | Impact report |
| `docs/reports/IMPLEMENTATION_REPORT_QUICKCREATE_MOBILE_WIDTH_V1.md` | This report |

## Width trace (nominal ~390px viewport)

| Level | Before | After |
|-------|--------|-------|
| Viewport | 390 | 390 |
| App shell / main | ~390 (`flex-1 min-w-0`) | ~390 |
| Thread column (`px-4`/`px-5`) | ~358–374 content | same |
| AgentBubble | **max 72% ≈ 258–269** | **100% of column ≈ 358–374** |
| QuickCreate card (`w-full`, `max-w-[36rem]`) | capped by 72% parent | fills column (≤36rem) |
| Form controls | 100% of narrow card | 100% of corrected card |

Outer gutters remain thread `px-4`/`px-5` (~16–20px). No `100vw`.

## Navigation

Closed drawer + FAB: no layout width reserved (unchanged). Opening drawer overlays; does not permanently shrink content.

## Category grid

Unchanged: `grid-cols-2 sm:grid-cols-3` in `StoreCreationDraftCard`. Gains usable width from parent fix; Vietnamese labels wrap inside buttons as before.

## Breakpoints / locales (logic verification)

| Breakpoint | Expected |
|------------|----------|
| 320 / 375 / 390 / 430 | Form = thread column width; 2-col categories (`grid-cols-2`) |
| 768+ (`sm`) | 3-col categories; card still ≤ `36rem` / `420px` |
| Desktop | Thread ≤ `720px` / `xl`; card max unchanged |

EN + VI: same layout classes; VI only stresses label wrap (no clipping expected once parent is full width).

## Remaining

None known for this bug. Manual Safari/PWA check recommended after deploy.
