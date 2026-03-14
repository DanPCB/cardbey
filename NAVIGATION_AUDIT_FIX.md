# Navigation Audit & Route Fix Summary

## Problem
"Create Smart Object" was landing on Content Studio home (`/app/creative-shell`) instead of opening the editor canvas at `/app/creative-shell/edit/:instanceId`.

## Root Causes Identified

### 1. Navigation Tracking
- No instrumentation to track where navigation actually goes
- No way to detect if a second `navigate()` call overwrites the first
- No visibility into React Router vs `window.location` navigation conflicts

### 2. Route Rendering
- Edit route (`/edit/:instanceId`) could potentially render home tiles if instance loading failed
- No explicit guard to prevent home UI from rendering on edit route
- Error states could fallback to home instead of showing error panel

## Fixes Applied

### 1. Navigation Instrumentation (`StoreDraftReview.tsx`)

**Added comprehensive logging:**
- `[NAV][PROMO] BEFORE navigation` - logs location before navigate call
- `[NAV][PROMO] AFTER navigation (next tick)` - logs location after navigate
- Stack traces to identify caller

**Added navigation guard (DEV only):**
- Monitors `popstate`, `pushState`, and `replaceState` for 2 seconds after navigation
- Detects if route is redirected away from `/edit/` path
- Logs warnings if unexpected navigation occurs

**Code:**
```typescript
// Log BEFORE navigation
console.log('[NAV][PROMO] BEFORE navigation', {
  editorUrl,
  locationBefore,
  pathname: window.location.pathname,
  search: window.location.search,
  resolvedInstanceId,
  stack: new Error().stack,
});

// Set up navigation guard
if (import.meta.env.DEV) {
  // Monitor for 2 seconds after navigation
  // Detects pushState/replaceState calls
  // Warns if redirected away from editor
}

// Log AFTER navigation
setTimeout(() => {
  console.log('[NAV][PROMO] AFTER navigation (next tick)', {
    locationAfter,
    matchesExpected: window.location.pathname === editorUrl.split('?')[0],
  });
}, 0);
```

### 2. Route Match Logger (`CreativeShell.tsx`)

**Added route match logging:**
- `[ROUTE_MATCH] creative-shell edit` - logs when edit route is matched
- Includes `instanceId`, `pathname`, `search`, `hash`

**Code:**
```typescript
function RouteMatchLogger({ children }: { children: React.ReactNode }) {
  const { instanceId } = useParams<{ instanceId: string }>();
  const location = useLocation();
  
  React.useEffect(() => {
    console.log('[ROUTE_MATCH] creative-shell edit', {
      instanceId,
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    });
  }, [instanceId, location.pathname, location.search, location.hash]);
  
  return <>{children}</>;
}
```

### 3. Edit Route Guard (`ContentStudioEditor.tsx`)

**Added explicit edit route enforcement:**
- Checks if pathname includes `/edit/` OR `instanceId` param exists
- If NOT on edit route, shows error (should never happen)
- If on edit route, can ONLY render: Loading | EditorCanvas | ErrorPanel
- NEVER renders home tiles

**Code:**
```typescript
// CRITICAL: Enforce that edit route NEVER renders home tiles
const isEditRoute = location.pathname.includes('/edit/') || !!instanceId;

if (!isEditRoute) {
  // Show error - should never reach here
  return <ErrorPanel />;
}

// On edit route, we can ONLY render: Loading | EditorCanvas | ErrorPanel
// NEVER render home tiles

if (isLoading) {
  return <EditorShell isLoading={true} />;
}

if (!instance) {
  // Show error panel with instanceId details (do NOT fallback to home)
  return <ErrorPanel instanceId={instanceId} />;
}

// Instance exists - render editor canvas
return <EditorShell><PreviewCanvas /></EditorShell>;
```

### 4. Error Panel Enhancement

**Improved error state:**
- Shows `instanceId`, `pathname`, `source` in error panel
- "Go back" button (respects `returnTo` param)
- Does NOT fallback to home - stays on edit route

## Files Changed

1. **`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`**
   - Added navigation instrumentation
   - Added navigation guard (DEV only)

2. **`apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/CreativeShell.tsx`**
   - Added `RouteMatchLogger` component
   - Wrapped edit route with logger

3. **`apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`**
   - Added edit route guard at top of render
   - Enhanced error panel with instanceId details
   - Removed fallback to home on error

## Verification

### Navigation Tracking
1. Click "Create Smart Object"
2. Check console for `[NAV][PROMO] BEFORE navigation` log
3. Check console for `[NAV][PROMO] AFTER navigation` log
4. Check console for `[NAV][PROMO] GUARD` logs if second navigate detected
5. Verify `matchesExpected: true` in AFTER log

### Route Matching
1. Check console for `[ROUTE_MATCH] creative-shell edit` log
2. Verify `instanceId` matches expected value
3. Verify `pathname` includes `/edit/`

### Edit Route Guard
1. Navigate to `/app/creative-shell/edit/:instanceId`
2. Verify editor canvas renders (not home tiles)
3. If instance fails to load, verify error panel shows (not home)
4. Verify error panel shows `instanceId` and path details

## Expected Behavior

1. **Navigation:** Single navigate call to `/app/creative-shell/edit/:instanceId?source=promo&...`
2. **Route Match:** Edit route matches and logs `[ROUTE_MATCH]`
3. **Render:** Editor canvas renders (or loading/error state, never home tiles)
4. **Guard:** If somehow not on edit route, shows error (should never happen)

## Debugging

If navigation still fails:
1. Check `[NAV][PROMO] BEFORE` log - verify `editorUrl` is correct
2. Check `[NAV][PROMO] AFTER` log - verify route actually changed
3. Check `[NAV][PROMO] GUARD` logs - see if second navigate overwrites
4. Check `[ROUTE_MATCH]` log - verify route is matched
5. Check edit route guard - verify `isEditRoute` is true


