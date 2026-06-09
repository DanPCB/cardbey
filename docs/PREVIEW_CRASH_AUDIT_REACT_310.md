# Website Preview React #310 — Diagnostic Audit

**Date:** 2026-06-05  
**Error:** Minified React error **#310** → `Rendered more hooks than during the previous render.`  
**Staging symptom:** Mission completes → store draft generated → Inspector Website Preview panel crashes.

**Scope:** Diagnose only. No UI/runtime/backend fixes applied in this pass.

---

## Root cause (primary suspect)

### `WebsitePreviewPage.tsx` — hooks **after** early return

| Location | Issue |
|----------|--------|
| `~L1754–1774` | Early `return` when `loading` or `error \|\| !preview` |
| `~L1805–1822` | **`useMemo` hooks run only on the success path** (`heroSocialLinks`, `savedWhatsappUrl`) |

**Failure sequence (matches staging):**

1. Draft preview loads with `loading: true` → component returns spinner; hook count = **N**
2. `loadDraftFromServer` completes → `setLoading(false)` + `setPreview(...)`
3. Next render skips early returns → executes **N + 2** hooks → React throws **#310**

**Smallest safe fix (not applied yet):** Move `heroSocialLinks` and `savedWhatsappUrl` `useMemo` calls **above** the `if (loading)` / `if (error)` early returns (or replace with plain computations).

---

## Component audit

### 1. `WebsitePreviewPage.tsx` ⚠️ **PRIMARY**

| Check | Finding |
|-------|---------|
| useEffect deps | Draft load effect `[isPublishedStandalone, capturedDraftId, loadDraftFromServer]` — `loadDraftFromServer` depends on `[capturedDraftId, searchParams]` (stable enough). Poll interval can call `setPreview` repeatedly — does not change hook count. |
| setState in render | None observed |
| setState in useMemo | None |
| Object recreation loops | `loadDraftFromServer` recreated when `searchParams` changes — can re-trigger draft load effect |
| Query refetch loops | No react-query; manual poll via `setInterval` in draft load effect |
| Unstable callback deps | `handleRepublishClick` has large dep array including `preview` object |
| **Hooks order** | **VIOLATION:** 2× `useMemo` after conditional `return` |

**Diagnostics added:** `[PREVIEW_CRASH] WebsitePreviewPage` render-phase + effect summary.

---

### 2. `PublicStoreSlugRoute.tsx` ✅ hooks OK

| Check | Finding |
|-------|---------|
| useEffect deps | Diagnostic effect on slug/load/error/store |
| Early returns | After `useQuery` + `useEffect` — hook order stable |
| Query refetch | `publicStoreQueryOptions` — `refetchOnWindowFocus: false` via shared options |

**Diagnostics added:** `[PREVIEW_CRASH] PublicStoreSlugRoute`

---

### 3. `publicMiniWebsiteMapper.ts` ✅ pure mapper

| Check | Finding |
|-------|---------|
| React hooks | None — pure functions |
| Risk | None for #310; mapping bugs would not cause hooks errors |

---

### 4. `usePublicStoreFeed.ts` ✅ hook factory

| Check | Finding |
|-------|---------|
| useInfiniteQuery | `staleTime: 4m`, `refetchOnWindowFocus: false`, `retry: 1` |
| Refetch loops | None by default |
| Used by preview? | Feed only — not in inspector preview path |

---

### 5. `useStorePreview.ts` — **not found**

No file at this path. Closest equivalents:

- `ConsoleExecutionPanel.tsx` — `inlineWebsitePreview` state from parent
- `storeDraftRuntimeSync.ts` — draft preview URL sync
- `websitePreviewRuntime.ts` — loading visibility helpers

---

### 6. `PreviewInspector.tsx` — **not found** → `ExecutionInspector.tsx` + `ConsoleExecutionPanel.tsx`

**`ExecutionInspector.tsx`**

| Check | Finding |
|-------|---------|
| Early return | `if (!persistEnabled) return null` at ~L557 **after** all hooks — OK |
| setState in useMemo | `mergedRetryDeps` useMemo returns object with callbacks — no setState |

**`ConsoleExecutionPanel.tsx`** (inspector website preview iframe ~L1562–1700)

| Check | Finding |
|-------|---------|
| Iframe | Loads `/preview/website/:draftId?embedded=true` — crash is **inside iframe** (`WebsitePreviewPage`) |
| setState loops | `menuPreviewReloadNonce` bump on catalog replace — remounts iframe only |
| Hook order | Stable in panel shell |

**Diagnostics added:** `[PREVIEW_CRASH] ConsoleExecutionPanel.InspectorWebsitePreview`

---

### 7. `InspectorWebsitePreview.tsx` — **not found** → `ConsoleExecutionPanel` iframe block

See §6. `data-inspector-preview` attribute on preview container (~L1568).

---

### 8. `StorefrontPreview.tsx` — **not found** → `CanonicalStorefrontRenderer.tsx`

| Check | Finding |
|-------|---------|
| Hooks | `useNavigate`, `useCallback` — stable |
| Early return | `if (!publishedPublicStore) return null` after hooks — OK |
| Wraps | `WebsitePreviewPage` for public + preview routes |

**ErrorBoundary added:** `WebsitePreviewErrorBoundary` around preview/public bodies.

---

### Secondary suspect: `DraftPreviewInspectorAutoSelect.tsx` ⚠️

| Check | Finding |
|-------|---------|
| Early return | `return null` **before** `useArtifactRuntimeInspector()` when debug flag set |
| Risk | #310 if `VITE_DEBUG_DISABLE_PREVIEW_AUTO_SELECT` toggles between renders (unlikely on staging) |

**Diagnostics added:** `[PREVIEW_CRASH] DraftPreviewInspectorAutoSelect`

---

## Instrumentation added

| Artifact | Purpose |
|----------|---------|
| `src/lib/preview/previewCrashDiagnostics.ts` | `logPreviewCrashDiagnostic`, `logPreviewCrashRenderPhase`, `isReactHooksOrderError` |
| `src/components/preview/WebsitePreviewErrorBoundary.tsx` | Catches subtree render errors; logs `[PREVIEW_CRASH]` with stack |
| `CanonicalStorefrontRenderer.tsx` | ErrorBoundary around `WebsitePreviewPage` trees |

### Console filter (staging)

```
[PREVIEW_CRASH]
```

Expected sequence on crash:

1. `[PREVIEW_CRASH] WebsitePreviewPage` with `suspectedReact310: true` and `phaseTransition: loading -> ready`
2. React #310 in minified build
3. `[PREVIEW_CRASH] WebsitePreviewErrorBoundary` with `reactHooksOrderError: true` (if error propagates to boundary; note: hook errors during render may bubble from same component)

---

## Fix applied (2026-06-05)

Moved `heroSocialLinks` and `savedWhatsappUrl` `useMemo` hooks above `if (loading)` / `if (error || !preview)` in `WebsitePreviewPage.tsx`. Tests: `WebsitePreviewPage.hooksOrder.test.tsx`, `storefrontRouteParity.test.tsx`.
