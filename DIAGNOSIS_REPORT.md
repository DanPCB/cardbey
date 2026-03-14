# Diagnosis Report: Why Preview Never Switches

## Root Cause Analysis

### 1. Manual Edit State Location

**File**: `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`

- **Line 73**: `const [isManualMode, setIsManualMode] = useState(false);`
- **Line 2181**: `isManualMode={isManualMode}` (passed to EditorShell)
- **Line 2182**: `onToggleManualMode={() => setIsManualMode(!isManualMode)}` (toggle handler)

✅ **Status**: Manual Edit state exists and is toggled correctly.

### 2. Preview Component Selection

**File**: `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/components/PreviewCanvas.tsx`

**Line 2213** in `ContentStudioEditor.tsx`:
```typescript
<PreviewCanvas
  aspectRatio={aspectRatio}
  onAspectChange={handleAspectChange}
  templateId={instance.templateId}
  draft={instance.data}
  instanceId={instance.id}
  onUpdate={handleSceneUpdate}
  selectedLayerId={selectedLayerId}
  onSelectLayer={setSelectedLayerId}
  showGrid={showGrid}
  onToggleGrid={() => setShowGrid(!showGrid)}
/>
```

❌ **PROBLEM**: `isManualMode` is **NOT passed** to `PreviewCanvas`!

### 3. PreviewCanvas Rendering Logic

**File**: `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/components/PreviewCanvas.tsx`

**Lines 321-382**: The rendering logic:

```typescript
if (template === 'promotion' && draft) {
  const layers: PromotionLayer[] = draft.layers || draft.data?.layers;
  
  if (layers && layers.length > 0) {
    // Render InteractiveCanvas
    return <InteractiveCanvas ... />;
  }
  
  // Fallback to legacy rendering
  return <PromotionPreview ... />;
}
```

**Root Cause**:
1. `PreviewCanvas` doesn't receive `isManualMode` prop
2. It only checks if `layers` exist
3. If layers don't exist OR if `isManualMode` is false, it falls back to `PromotionPreview`
4. Even when `isManualMode` is true, if layers are missing, it still renders `PromotionPreview`

### 4. PromotionPreview Always Renders

**File**: `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/templates/promotion/PromotionPreview.tsx`

**Line 114**: `export default function PromotionPreview({...})`

This component logs `[PromotionPreview] Rendering state...` even when Manual Edit is active because:
- `PreviewCanvas` doesn't know about `isManualMode`
- It always falls back to `PromotionPreview` when layers are missing or when not explicitly told to use `InteractiveCanvas`

## Exact File Locations

### isManualMode is set/toggled:
- **File**: `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`
- **Line 73**: `const [isManualMode, setIsManualMode] = useState(false);`
- **Line 2181**: `isManualMode={isManualMode}` (passed to EditorShell)
- **Line 2182**: `onToggleManualMode={() => setIsManualMode(!isManualMode)}`

### PromotionPreview is rendered:
- **File**: `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/components/PreviewCanvas.tsx`
- **Line 368**: `return <PromotionPreview ... />;` (fallback rendering)

### PreviewCanvas is called:
- **File**: `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`
- **Line 2213**: `<PreviewCanvas ... />` (missing `isManualMode` prop)

## Summary

**The Problem**: 
- `isManualMode` state exists and toggles correctly
- But `PreviewCanvas` never receives `isManualMode` prop
- `PreviewCanvas` only checks for `layers` existence, not `isManualMode`
- Result: Always renders `PromotionPreview` regardless of `isManualMode` state

**The Fix**:
1. Pass `isManualMode` to `PreviewCanvas`
2. Update `PreviewCanvas` to check `isManualMode` and render `InteractiveCanvas` when true
3. Ensure layers are always created when `isManualMode` is enabled

