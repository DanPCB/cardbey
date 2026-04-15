# SSE Client Debugging Guide

## Problem: No SSE Request Appearing in Network Tab

If you see **no request at all** in the Network tab (not even a failed one), the SSE client code is not running or is failing before creating the EventSource.

## Step-by-Step Debugging

### Step 1: Check if SSE Client Code is Running

**Location**: `marketing-dashboard/src/lib/sseClient.ts` (or similar)

**Action**: Add debug logging at the very top of the `connect()` function:

```typescript
export function connect(url: string, options?: SSEOptions) {
  console.log('[SSE DEBUG] connect() called with URL:', url);
  console.log('[SSE DEBUG] Full URL:', url);
  console.log('[SSE DEBUG] Options:', options);
  
  // ... rest of the function
}
```

**Also add logging when creating EventSource**:

```typescript
export function connect(url: string, options?: SSEOptions) {
  console.log('[SSE DEBUG] connect() called with URL:', url);
  
  try {
    console.log('[SSE DEBUG] About to create EventSource with URL:', url);
    const eventSource = new EventSource(url);
    console.log('[SSE DEBUG] EventSource created successfully', {
      url: eventSource.url,
      readyState: eventSource.readyState,
    });
    // ... rest of the function
  } catch (error) {
    console.error('[SSE DEBUG] Error creating EventSource:', error);
    throw error;
  }
}
```

**Reload the dashboard and check the Console tab.**

**Expected outcomes**:
- ✅ **Outcome A**: You see `[SSE DEBUG] connect() called` → Client is running, but EventSource creation might be failing
- ❌ **Outcome B**: You see no log → Client code is not being executed (see Step 2)
- ⚠️ **Outcome C**: You see the log but no network request → Exception thrown before EventSource creation

---

### Step 2: Check if SSE Client is Being Imported/Used

**Check these files in marketing-dashboard**:

1. **AppShell or main entry point** (`src/App.tsx`, `src/AppShell.tsx`, or similar):
   ```typescript
   // Should have something like:
   import { subscribe } from '@/lib/sseClient';
   // or
   import { useSSE } from '@/hooks/useSSE';
   ```

2. **Check if subscribe() is being called**:
   ```typescript
   useEffect(() => {
     console.log('[SSE DEBUG] AppShell mounted, initializing SSE');
     const unsubscribe = subscribe('default', {
       onMessage: (event) => { /* ... */ },
       onError: (error) => { /* ... */ },
     });
     console.log('[SSE DEBUG] subscribe() returned:', unsubscribe);
     return unsubscribe;
   }, []);
   ```

3. **Check for conditional rendering that might prevent SSE initialization**:
   ```typescript
   // Look for things like:
   if (!isAuthenticated) return null; // This would prevent SSE
   if (!someCondition) return <Loading />; // This might prevent SSE
   ```

---

### Step 3: Check coreBaseUrl Configuration

**The SSE client needs the core API base URL to construct the SSE endpoint URL.**

**Check in browser console** (after reloading dashboard):

```javascript
// Run these in the browser console:
console.log('VITE_CORE_BASE_URL:', import.meta.env.VITE_CORE_BASE_URL);
console.log('window.__APP_API_BASE__:', window.__APP_API_BASE__);

// Check what the SSE client is using:
// (You might need to add a log in sseClient.ts to see this)
```

**Expected value**: `"http://192.168.1.7:3001"`

**If it's undefined or empty**:

1. **Check `.env` file** in marketing-dashboard:
   ```env
   VITE_CORE_BASE_URL=http://192.168.1.7:3001
   ```

2. **Check `src/lib/apiBase.ts` or similar**:
   ```typescript
   export function getCoreBaseUrl() {
     const url = import.meta.env.VITE_CORE_BASE_URL;
     console.log('[SSE DEBUG] getCoreBaseUrl() returned:', url);
     if (!url) {
       console.error('[SSE DEBUG] VITE_CORE_BASE_URL is not set!');
     }
     return url;
   }
   ```

3. **Check if SSE client uses this**:
   ```typescript
   import { getCoreBaseUrl } from '@/lib/apiBase';
   
   export function connect(url: string, options?: SSEOptions) {
     const baseUrl = getCoreBaseUrl();
     console.log('[SSE DEBUG] Base URL:', baseUrl);
     
     if (!baseUrl) {
       console.error('[SSE DEBUG] Cannot connect: baseUrl is undefined');
       return; // This would prevent EventSource creation
     }
     
     const fullUrl = `${baseUrl}${url}`;
     console.log('[SSE DEBUG] Full SSE URL:', fullUrl);
     // ... create EventSource
   }
   ```

---

### Step 4: Check for Old Shim Code

**Search for these files in marketing-dashboard** and ensure they're not being imported:

1. `src/lib/eventsource-shim.ts` - Should be deleted or not imported
2. `src/hooks/useEventSource.js` - Should use unified client, not create EventSource directly
3. `src/contexts/sseContext.jsx` - Should use unified client
4. `src/hooks/useSingletonEventSource.ts` - Should use unified client

**Check for direct EventSource usage**:
```bash
# In marketing-dashboard directory:
grep -r "new EventSource" src/
grep -r "installEventSourceShim" src/
```

**All should use**:
```typescript
import { subscribe } from '@/lib/sseClient';
// NOT:
// new EventSource(...)
// installEventSourceShim();
```

---

### Step 5: Check Component Mounting

**If the SSE client is initialized in a component, ensure that component is actually mounting:**

1. **Add mount logging**:
   ```typescript
   // In the component that initializes SSE:
   useEffect(() => {
     console.log('[SSE DEBUG] Component mounted, initializing SSE');
     // ... SSE initialization
   }, []);
   ```

2. **Check React DevTools** to see if the component is in the component tree

3. **Check for route guards** that might prevent the component from mounting:
   ```typescript
   // Look for:
   if (!user) return <Navigate to="/login" />;
   if (!hasPermission) return <AccessDenied />;
   ```

---

## Quick Diagnostic Checklist

Run through this checklist in order:

- [ ] **Console shows `[SSE DEBUG] connect() called`** → Client is running
- [ ] **Console shows `[SSE DEBUG] About to create EventSource`** → URL is valid
- [ ] **Console shows `[SSE DEBUG] EventSource created successfully`** → EventSource was created
- [ ] **Network tab shows `GET /api/stream`** → Request was made
- [ ] **`VITE_CORE_BASE_URL` is set** → Configuration is correct
- [ ] **No old shim code is imported** → Using unified client
- [ ] **Component with SSE initialization is mounting** → Code is executing

## Common Issues and Fixes

### Issue 1: `connect()` is never called
**Cause**: Component not mounting, or conditional logic preventing execution
**Fix**: Check component mounting and remove conditions that block SSE initialization

### Issue 2: `coreBaseUrl` is undefined
**Cause**: Missing `.env` variable or incorrect import
**Fix**: Set `VITE_CORE_BASE_URL` in `.env` file and restart dev server

### Issue 3: Exception thrown before EventSource creation
**Cause**: Invalid URL, missing base URL, or other initialization error
**Fix**: Check console for error messages, verify URL construction

### Issue 4: Old shim code still active
**Cause**: Old code path still being used
**Fix**: Remove old imports and ensure all code uses unified client

---

## Next Steps After Adding Debug Logs

1. **Add the debug logs** to `sseClient.ts` (or wherever the SSE client is)
2. **Reload the dashboard**
3. **Check Console tab** for `[SSE DEBUG]` messages
4. **Check Network tab** (filter by "All" or "XHR", not "Media")
5. **Share the results**:
   - Screenshot of Console tab
   - Screenshot of Network tab
   - Any error messages

This will show exactly where the initialization is failing.

