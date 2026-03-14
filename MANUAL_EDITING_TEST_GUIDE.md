# Manual Editing Testing Guide

## Quick Test Steps

### 1. Access the Editor

**From Store Review Page:**
1. Navigate to: `/app/store/:storeId/review?mode=draft&jobId=:jobId`
2. Click "Create Promo" or "Smart Object" on a product
3. Should navigate to: `/app/creative-shell/edit/:instanceId?source=promo&intent=promotion&...`

**Direct URL (if you have an instanceId):**
```
http://localhost:5174/app/creative-shell/edit/cmkdgued5002qjvg4d5w306fq?source=promo&intent=promotion&storeId=cmkaivmpc0003jvd80v7bshir
```

### 2. Verify Manual Edit Button Appears

**Check Header:**
- Look for "Manual Edit" button in the top bar
- Should be positioned between aspect ratio toggle (9:16 / 16:9) and Save/Publish buttons
- Button should be gray/slate colored initially

**Visual Check:**
```
[Back] ← [9:16] [16:9] ← [Manual Edit] [Save] [Publish]
```

### 3. Test Manual Edit Toggle

**Step 1: Enable Manual Mode**
1. Click "Manual Edit" button
2. Button should turn **violet/purple** (active state)
3. Tooltip should show: "Manual Edit: ON - Click to disable"

**Step 2: Verify Layer Editing UI Appears**
1. Check right panel (Properties Panel)
2. Should see "Layers" section with layer list
3. If layers exist, they should be listed

**Step 3: Disable Manual Mode**
1. Click "Manual Edit" button again
2. Button should return to gray/slate (inactive state)
3. Layer editing UI may hide (if not in promo mode)

### 4. Test Layer Selection

**Prerequisites:**
- Manual Edit mode must be ON
- Canvas must have layers (promotion template should have layers)

**Steps:**
1. Click on a layer in the canvas (text, image, or QR code)
2. Layer should show selection outline (violet ring)
3. Right panel should show layer properties:
   - If text layer: Text Properties (font, size, color, etc.)
   - If image layer: Image Properties (replace, fit, opacity)
   - If QR layer: QR Properties (size, position, label)

**Verify:**
- Selection outline appears on canvas
- Properties panel updates to show selected layer
- Layer name appears in Layers list with highlight

### 5. Test Layer Editing

**Text Layer:**
1. Select a text layer
2. In Properties Panel, edit text content
3. Verify text updates immediately on canvas
4. Change font size, color, alignment
5. Verify changes reflect on canvas

**Image Layer:**
1. Select an image layer
2. Click "Replace Image" in Properties Panel
3. Select new image from Media Library
4. Verify image updates on canvas
5. Change fit option (cover/contain/stretch)
6. Verify image adjusts on canvas

**QR Layer:**
1. Select a QR layer (if exists)
2. Change size slider
3. Verify QR code resizes on canvas
4. Toggle "Show Background Plate"
5. Toggle "Show Label"
6. Change position preset (bottom-right, bottom-left)
7. Verify QR moves on canvas

### 6. Test Canvas Interactions

**Drag Layer:**
1. Select a layer
2. Click and drag on canvas
3. Layer should move with mouse
4. Release to drop
5. Verify layer position updates

**Resize Layer:**
1. Select a layer
2. Click and drag corner resize handles
3. Layer should resize
4. Verify size updates in Properties Panel

**Rotate Layer:**
1. Select a layer
2. Click and drag rotation handle (top center)
3. Layer should rotate
4. Verify rotation updates in Properties Panel

### 7. Test Save Functionality

**Steps:**
1. Make some manual edits (move layer, change text, etc.)
2. Click "Save" button in header
3. Check browser console for save confirmation
4. Reload the page (F5 or Cmd+R)
5. Verify edits are still present

**Expected:**
- Save button should work (no errors)
- Edits should persist after reload
- Console should show: `[ContentStudioEditor] Draft saved to localStorage`

### 8. Test Publish Functionality

**Steps:**
1. Make some manual edits
2. Click "Publish" button in header
3. Should navigate to deploy page or show success message
4. Verify publish flow still works

**Expected:**
- Publish button should work (no errors)
- Should navigate to `/app/creative-shell/deploy/:instanceId`
- Edits should be included in published version

### 9. Test Redirect from /contents

**Steps:**
1. Navigate to: `http://localhost:5174/contents`
2. Should redirect to: `http://localhost:5174/app/creative-shell`
3. Verify redirect happens (no 404)

**Expected:**
- Redirect happens immediately
- No error page
- Lands on Content Studio home

### 10. Test Grid Toggle (Bonus)

**Steps:**
1. Look for Grid icon in header (if present)
2. Click to toggle grid overlay
3. Verify grid appears/disappears on canvas

## Debugging Tips

### Enable Debug Logging

**In Browser Console:**
```javascript
localStorage.setItem('cardbey.debug', 'true');
localStorage.setItem('CB_DEBUG_EDITOR', '1');
```

**Then reload page and check console for:**
- `[ContentStudioEditor][SET_INSTANCE]` - Instance state changes
- `[ContentStudioEditor][READY]` - Editor ready state
- `[PROMO_BOOTSTRAP]` - Promo initialization
- `[LAYER_COUNTS]` - Layer counts by type

### Check Layer State

**In Browser Console:**
```javascript
// Get current instance
const instance = JSON.parse(localStorage.getItem('cardbey.instance') || '{}');
console.log('Layers:', instance.data?.layers);
console.log('Manual Mode:', /* check isManualMode state in React DevTools */);
```

### Verify API Calls

**In Browser Network Tab:**
- Filter by "XHR" or "Fetch"
- Look for calls to `/api/contents/:instanceId`
- Should use canonical base URL (not relative `/api`)
- Check response status (should be 200)

## Common Issues & Solutions

### Issue: Manual Edit Button Not Visible

**Check:**
1. Is `onToggleManualMode` prop passed to `EditorShell`?
2. Check browser console for errors
3. Verify `ContentStudioEditor.tsx` line 2114 has `onToggleManualMode`

### Issue: Layer Editing UI Not Showing

**Check:**
1. Is `isManualMode` state true? (check React DevTools)
2. Are layers present? Check `draft.data?.layers`
3. Is `isManualMode` prop passed to `PropertiesPanel`?

### Issue: Canvas Interactions Not Working

**Check:**
1. Are layers present? `InteractiveCanvas` only works when layers exist
2. Is `onSelectLayer` and `onUpdateLayer` passed to `InteractiveCanvas`?
3. Check `PreviewCanvas.tsx` line 327 - should have `hasLayers && onSelectLayer && onUpdate`

### Issue: Save Not Persisting

**Check:**
1. Check browser console for save errors
2. Verify `handleSave` function in `ContentStudioEditor.tsx`
3. Check localStorage: `localStorage.getItem('cardbey.instance')`

### Issue: Publish Not Working

**Check:**
1. Check browser console for publish errors
2. Verify `handlePublish` function in `ContentStudioEditor.tsx`
3. Check if required context is present (storeId, tenantId)

## Automated Test Script (Optional)

**Create test file: `test-manual-editing.js`**
```javascript
// Run in browser console on editor page

async function testManualEditing() {
  console.log('🧪 Testing Manual Editing...');
  
  // 1. Check if Manual Edit button exists
  const manualEditBtn = document.querySelector('button[title*="Manual Edit"]');
  if (!manualEditBtn) {
    console.error('❌ Manual Edit button not found');
    return;
  }
  console.log('✅ Manual Edit button found');
  
  // 2. Click to enable
  manualEditBtn.click();
  await new Promise(r => setTimeout(r, 100));
  
  // 3. Check if button is active (violet)
  const isActive = manualEditBtn.classList.contains('bg-violet-500') || 
                   manualEditBtn.style.backgroundColor.includes('violet');
  if (!isActive) {
    console.error('❌ Manual Edit button not active after click');
    return;
  }
  console.log('✅ Manual Edit mode enabled');
  
  // 4. Check if Layers panel is visible
  const layersPanel = document.querySelector('[class*="Layers"]');
  if (!layersPanel) {
    console.warn('⚠️ Layers panel not found (may not have layers)');
  } else {
    console.log('✅ Layers panel visible');
  }
  
  // 5. Check if canvas has interactive elements
  const canvas = document.querySelector('[class*="InteractiveCanvas"]');
  if (!canvas) {
    console.warn('⚠️ InteractiveCanvas not found (may not have layers)');
  } else {
    console.log('✅ InteractiveCanvas found');
  }
  
  console.log('✅ All tests passed!');
}

testManualEditing();
```

## Manual Test Checklist

- [ ] Navigate to editor from Store → Product → Promotion
- [ ] Manual Edit button appears in header
- [ ] Click Manual Edit - button turns violet
- [ ] Layer editing UI appears in right panel
- [ ] Click layer on canvas - selection outline appears
- [ ] Edit text layer properties - preview updates
- [ ] Edit image layer properties - preview updates
- [ ] Drag layer on canvas - layer moves
- [ ] Resize layer - size updates
- [ ] Save - changes persist
- [ ] Reload page - edits still present
- [ ] Publish - still works
- [ ] Navigate to `/contents` - redirects correctly
- [ ] No console errors
- [ ] No duplicate canvases

## Expected Console Output (DEV mode)

When working correctly, you should see:
```
[ROUTE_RENDER] edit/:instanceId -> ContentStudioEditor
[ContentStudioEditor][SET_INSTANCE] { action: 'set', ... }
[ContentStudioEditor][READY] { instanceId: '...', templateId: 'promotion' }
[LAYER_COUNTS] { background: 1, text: 2, image: 0, qr: 0, total: 3 }
```

No errors should appear.

