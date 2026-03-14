# Visibility Pause Testing Guide

**Feature:** Automatic polling pause when tab is hidden  
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/hooks/usePoller.ts`  
**Status:** ✅ Implemented - Ready for Testing

---

## 🧪 Quick Test (2 minutes)

### Step 1: Start Polling
1. **Start the development server:**
   ```bash
   cd apps/dashboard/cardbey-marketing-dashboard
   pnpm dev
   ```

2. **Navigate to store review page:**
   - Go to: `http://localhost:5174/app/store/YOUR_STORE_ID/review?mode=draft`
   - Or start a new store generation flow

3. **Open browser DevTools:**
   - Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
   - Go to **Console** tab
   - Go to **Network** tab

4. **Verify polling is active:**
   - In **Network tab**, you should see repeated requests to:
     - `GET /api/stores/:storeId/draft` (every 2 seconds)
     - `GET /api/mi/orchestra/job/:jobId` (if jobId exists)
   - In **Console tab**, you should see `[DRAFT_STATE]` logs when state changes

---

### Step 2: Test Visibility Pause

1. **Switch to another tab** (or minimize browser):
   - Click on a different browser tab
   - OR press `Alt+Tab` to switch to another application
   - OR minimize the browser window

2. **Check Console:**
   - You should see: `[usePoller] Tab hidden - polling paused`
   - If you don't see it, check that you're in dev mode

3. **Check Network tab:**
   - **Polling requests should STOP**
   - No new `GET /api/stores/:storeId/draft` requests
   - No new `GET /api/mi/orchestra/job/:jobId` requests
   - Existing requests may complete, but no new ones start

4. **Wait 10-15 seconds:**
   - Verify no new polling requests appear
   - This confirms polling is truly paused

---

### Step 3: Test Resume

1. **Switch back to the tab:**
   - Click back on the Cardbey tab
   - OR restore the browser window

2. **Check Console:**
   - You should see: `[usePoller] Tab visible - polling resumed`

3. **Check Network tab:**
   - **Polling requests should RESUME immediately**
   - New `GET /api/stores/:storeId/draft` requests should appear
   - Requests should continue at 2-second intervals

4. **Verify data freshness:**
   - The draft status should update when you return
   - No stale data (polling resumes immediately)

---

## 🔍 Detailed Test Scenarios

### Test 1: Basic Visibility Pause ✅

**Setup:**
- Store review page is open and polling
- DevTools Network tab is open

**Steps:**
1. Switch to another tab
2. Wait 10 seconds
3. Switch back

**Expected Results:**
- ✅ Console: `[usePoller] Tab hidden - polling paused`
- ✅ Network: No requests while tab hidden
- ✅ Console: `[usePoller] Tab visible - polling resumed`
- ✅ Network: Requests resume immediately

---

### Test 2: Multiple Tab Switches ✅

**Setup:**
- Store review page is open and polling

**Steps:**
1. Switch away (tab hidden)
2. Wait 5 seconds
3. Switch back (tab visible)
4. Wait 3 seconds
5. Switch away again (tab hidden)
6. Wait 5 seconds
7. Switch back (tab visible)

**Expected Results:**
- ✅ Polling pauses each time tab is hidden
- ✅ Polling resumes each time tab is visible
- ✅ No duplicate requests
- ✅ No errors in console

---

### Test 3: Polling During Generation ✅

**Setup:**
- Start a new store generation
- Navigate to review page
- Polling should be active (status='generating')

**Steps:**
1. Verify polling is active (check Network tab)
2. Switch to another tab
3. Wait 15 seconds (generation continues in background)
4. Switch back

**Expected Results:**
- ✅ Polling paused while tab hidden
- ✅ Polling resumes when tab visible
- ✅ Draft status updates correctly when you return
- ✅ No missed state transitions

---

### Test 4: Terminal State Detection ✅

**Setup:**
- Store generation completes (status='ready' or 'error')
- Polling should stop (terminal state)

**Steps:**
1. Wait for generation to complete
2. Verify polling stopped (no more requests)
3. Switch to another tab
4. Switch back

**Expected Results:**
- ✅ No polling requests (terminal state)
- ✅ No console errors
- ✅ UI shows final state correctly

---

### Test 5: SSR Safety ✅

**Setup:**
- This test is for server-side rendering compatibility

**Expected Results:**
- ✅ No errors when `document` is undefined (SSR)
- ✅ Hook initializes correctly on client
- ✅ Visibility tracking works after hydration

---

## 📊 What to Look For

### ✅ Success Indicators

1. **Console Logs:**
   ```
   [usePoller] Tab hidden - polling paused
   [usePoller] Tab visible - polling resumed
   ```

2. **Network Tab:**
   - Requests stop when tab hidden
   - Requests resume when tab visible
   - No duplicate or overlapping requests

3. **UI Behavior:**
   - No flickering or errors
   - Data updates correctly when tab becomes visible
   - No stale data displayed

### ❌ Failure Indicators

1. **Polling continues when tab hidden:**
   - Network tab shows requests while tab is hidden
   - **Fix:** Check that `pauseOnHidden` is not set to `false`

2. **Polling doesn't resume:**
   - No requests when tab becomes visible
   - **Fix:** Check console for errors, verify `isVisible` state

3. **Console errors:**
   - `document is not defined` (SSR issue)
   - **Fix:** Should be handled, but check SSR setup

4. **Duplicate requests:**
   - Multiple requests firing simultaneously
   - **Fix:** Check single-flight guard is working

---

## 🐛 Troubleshooting

### Issue: Console logs not appearing

**Possible causes:**
- Not in development mode
- Console filter is hiding logs
- Browser doesn't support `visibilitychange` API

**Solutions:**
- Check `import.meta.env.DEV` is true
- Clear console filters
- Test in Chrome/Firefox (both support visibility API)

---

### Issue: Polling doesn't pause

**Possible causes:**
- `pauseOnHidden: false` is set somewhere
- Browser throttling is interfering
- Multiple polling instances

**Solutions:**
- Check `usePoller` calls for `pauseOnHidden: false`
- Test in different browser
- Check for multiple `usePoller` instances

---

### Issue: Polling doesn't resume

**Possible causes:**
- `enabled` prop is false
- Component unmounted
- Terminal state reached

**Solutions:**
- Check `enabled` prop value
- Verify component is still mounted
- Check if terminal state was reached

---

## 📝 Test Checklist

### Basic Functionality
- [ ] Polling pauses when tab is hidden
- [ ] Polling resumes when tab is visible
- [ ] Console logs appear in dev mode
- [ ] Network requests stop/resume correctly

### Edge Cases
- [ ] Multiple tab switches work correctly
- [ ] Polling during generation works
- [ ] Terminal state detection still works
- [ ] No duplicate requests

### Integration
- [ ] Works with draft polling
- [ ] Works with job polling
- [ ] No breaking changes to existing code
- [ ] SSR-safe (no errors on server)

---

## 🎯 Expected Behavior Summary

| Scenario | Expected Behavior |
|----------|------------------|
| **Tab visible + enabled=true** | ✅ Polling active |
| **Tab hidden + enabled=true** | ⏸️ Polling paused |
| **Tab visible + enabled=false** | ⏸️ Polling stopped |
| **Tab hidden + enabled=false** | ⏸️ Polling stopped |
| **Tab becomes visible** | ▶️ Polling resumes immediately |
| **Tab becomes hidden** | ⏸️ Polling pauses immediately |

---

## 🚀 Quick Verification Script

**Copy-paste into browser console while on review page:**

```javascript
// Check if visibility API is supported
console.log('Visibility API supported:', typeof document !== 'undefined' && 'hidden' in document);

// Check current visibility state
console.log('Tab is hidden:', document.hidden);

// Monitor visibility changes
document.addEventListener('visibilitychange', () => {
  console.log('Visibility changed:', document.hidden ? 'HIDDEN' : 'VISIBLE');
});

// Check polling status (if you can access it)
// Look for [usePoller] logs in console
```

---

## ✅ Success Criteria

The implementation is working correctly if:

1. ✅ **Polling pauses** when you switch tabs
2. ✅ **Polling resumes** when you return
3. ✅ **No errors** in console
4. ✅ **No duplicate requests** in Network tab
5. ✅ **Data updates** correctly when tab becomes visible
6. ✅ **Console logs** appear in dev mode

---

## 📞 If Something Doesn't Work

1. **Check browser console** for errors
2. **Check Network tab** for request patterns
3. **Verify dev mode** is enabled
4. **Test in different browser** (Chrome/Firefox)
5. **Check React DevTools** for hook state

**Common fixes:**
- Clear browser cache
- Restart dev server
- Check for TypeScript errors
- Verify `pauseOnHidden` is not explicitly set to `false`

---

## 🎉 Next Steps After Testing

Once you've verified the visibility pause works:

1. **If it works:** ✅ Ready for production
2. **If issues found:** Share the specific scenario and I'll fix it
3. **If you want enhancements:** We can add Priority 2 (Enhanced Hook) next

---

**Happy Testing!** 🚀

