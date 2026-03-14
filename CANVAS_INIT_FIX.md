# Canvas Initialization Fix - Promo Bootstrap

## Problem
Promo bootstrap was producing "unknown" template dead-ends. Logs showed:
- `PROMO_BOOTSTRAP` context printed
- `/api/contents/:id` returns 200
- "Template 'unknown' not found, but data exists. Using data directly."
- Yet canvas does not appear

## Root Causes

1. **Template "unknown" dead-end**: When templateId is "unknown", template lookup fails and canvas doesn't render
2. **Missing artboard**: Draft might not have proper data structure (artboard)
3. **No layers**: Draft might be empty with no layers to render
4. **No decision logging**: Couldn't see why canvas wasn't rendering

## Fixes Applied

### 1. `ensureEditorDraftRenderable()` Function (`ContentStudioEditor.tsx`)

**Purpose**: Guarantees draft has template, artboard, and at least one layer before rendering.

**Steps:**
1. **Upgrade template**: If `templateId === 'unknown'` and `source === 'promo'`, upgrade to `'promotion'`
2. **Ensure artboard**: Create `data` object if missing
3. **Ensure aspect ratio**: Set default based on environment (screen → 16:9, print → 9:16)
4. **Ensure scene structure**: Initialize `scene1`, `scene2`, `scene3` for promo drafts
5. **Add image layer**: If `imageUrl` provided, add to `scene1.promo.backgroundImageUrl`
6. **Ensure at least one layer**: Add placeholder content if no layers exist
7. **Ensure sceneIndex**: Validate and set default to 0

**Code:**
```typescript
function ensureEditorDraftRenderable(draft: any, bootstrapContext: {
  source?: string | null;
  imageUrl?: string | null;
  environment?: string | null;
  format?: string | null;
}) {
  // Step 1: Upgrade template if unknown but source=promo
  if (draft.templateId === 'unknown' && bootstrapContext.source === 'promo') {
    draft.templateId = 'promotion';
    draft.data.meta.mode = 'promo';
    draft.data.meta.templateId = 'promotion';
  }
  
  // Step 2-7: Ensure artboard, aspect, scenes, layers, etc.
  // ...
  
  return draft;
}
```

**Called before `setInstance()`:**
```typescript
const bootstrapContext = {
  source: querySource,
  imageUrl: queryImageUrl,
  environment: searchParams.get('environment'),
  format: searchParams.get('format'),
};

loaded = ensureEditorDraftRenderable(loaded, bootstrapContext);
saveInstance(loaded);
setInstance(loaded);
```

### 2. Decision Logging (`ContentStudioEditor.tsx`)

**Added `[EDITOR][DECISION]` logs** to track why canvas doesn't render:

```typescript
let viewState: 'home' | 'canvas' | 'loading' | 'error' = 'loading';
let viewReason = '';

if (!isEditRoute) {
  viewState = 'error';
  viewReason = 'not_on_edit_route';
} else if (isLoading) {
  viewState = 'loading';
  viewReason = 'instance_loading';
} else if (!instance) {
  viewState = 'error';
  viewReason = 'instance_not_found';
} else {
  viewState = 'canvas';
  viewReason = 'instance_loaded';
}

console.log('[EDITOR][DECISION]', {
  view: viewState,
  reason: viewReason,
  isEditRoute,
  hasInstanceId: !!instanceId,
  isLoading,
  hasInstance: !!instance,
  pathname: location.pathname,
  templateId: instance?.templateId,
  hasData: !!instance?.data,
});
```

### 3. Enhanced Canvas Init Logging

**Updated `[EDITOR] init canvas` log** to include layer count:

```typescript
console.log('[EDITOR] init canvas', {
  instanceId: loaded.id,
  templateId: loaded.templateId,
  hasArtboard,
  layerCount,
  hasImageLayer,
  hasSceneLayers,
  layers: (layerCount > 0 || hasSceneLayers) ? '>=1' : '0', // NEW
  aspect,
  sceneIndex: sceneIdx,
  source: querySource,
});
```

### 4. Hard Fail-Safe Redirect (`CreativeShell.tsx`)

**Added `HomeRedirectGuard` component** to redirect from home to edit if `instanceId` exists in query:

```typescript
function HomeRedirectGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [hasRedirected, setHasRedirected] = React.useState(false);
  
  React.useEffect(() => {
    if (
      location.pathname === '/app/creative-shell' &&
      !location.pathname.includes('/edit/') &&
      !hasRedirected
    ) {
      const searchParams = new URLSearchParams(location.search);
      const instanceId = searchParams.get('instanceId');
      
      if (instanceId) {
        const restParams = new URLSearchParams(searchParams);
        restParams.delete('instanceId');
        const queryString = restParams.toString();
        const editorPath = `/app/creative-shell/edit/${instanceId}`;
        const redirectUrl = queryString ? `${editorPath}?${queryString}` : editorPath;
        
        if (import.meta.env.DEV) {
          console.log('[REDIRECT] home->edit', {
            instanceId,
            from: location.pathname + location.search,
            to: redirectUrl,
          });
        }
        
        setHasRedirected(true);
        navigate(redirectUrl, { replace: true });
      }
    }
  }, [location.pathname, location.search, navigate, hasRedirected]);
  
  return <>{children}</>;
}
```

**Wraps all routes:**
```typescript
export default function CreativeShell() {
  return (
    <HomeRedirectGuard>
      <Routes>
        {/* ... routes ... */}
      </Routes>
    </HomeRedirectGuard>
  );
}
```

## Files Changed

1. **`apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`**
   - Added `ensureEditorDraftRenderable()` function
   - Added decision logging `[EDITOR][DECISION]`
   - Enhanced canvas init logging with layer count
   - Called `ensureEditorDraftRenderable()` before `setInstance()`

2. **`apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/CreativeShell.tsx`**
   - Added `HomeRedirectGuard` component
   - Wrapped routes with guard
   - Added `useNavigate` import

## Verification

### Expected Logs

1. **Bootstrap:**
   ```
   [CONTENT_STUDIO][PROMO_BOOTSTRAP] Bootstrap context: {...}
   ```

2. **Ensure Renderable:**
   ```
   [ensureEditorDraftRenderable] Upgrading unknown template to promotion
   [ensureEditorDraftRenderable] Final state: { templateId: 'promotion', hasArtboard: true, layers: '>=1' }
   ```

3. **Canvas Init:**
   ```
   [EDITOR] init canvas: { hasArtboard: true, layers: '>=1', ... }
   ```

4. **Decision:**
   ```
   [EDITOR][DECISION] { view: 'canvas', reason: 'instance_loaded', ... }
   ```

5. **Redirect (if needed):**
   ```
   [REDIRECT] home->edit { instanceId: '...', from: '...', to: '...' }
   ```

### Expected Behavior

1. **Template Upgrade**: `unknown` → `promotion` when `source=promo`
2. **Artboard Created**: `data` object exists with `aspect` and `sceneIndex`
3. **Layers Present**: At least one layer (scene content or elements)
4. **Canvas Renders**: Editor canvas appears (not home tiles)
5. **Redirect Works**: If landing on home with `instanceId`, redirects to edit route

## Testing

1. Click "Create Smart Object" from product card
2. Check console for:
   - `[ensureEditorDraftRenderable]` logs showing template upgrade
   - `[EDITOR] init canvas` with `hasArtboard: true` and `layers: '>=1'`
   - `[EDITOR][DECISION]` with `view: 'canvas'`
3. Verify canvas renders (not home tiles)
4. If landing on `/app/creative-shell?instanceId=...`, verify redirect to `/app/creative-shell/edit/:instanceId`

## Why This Won't Regress

1. **Template Upgrade**: Explicitly upgrades `unknown` to `promotion` for promo drafts
2. **Artboard Guarantee**: Always creates `data` object if missing
3. **Layer Guarantee**: Always adds at least one layer (placeholder if needed)
4. **Decision Logging**: Can see exactly why canvas doesn't render
5. **Redirect Guard**: Prevents landing on home when `instanceId` exists


