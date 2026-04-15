# Quick Fix: Add SSE Debug Logging

## For Marketing Dashboard (Frontend)

Since the SSE client code is in the `marketing-dashboard` repository, you need to add debug logging there.

### Step 1: Find the SSE Client File

The unified SSE client is likely at one of these locations:
- `src/lib/sseClient.ts`
- `src/lib/sse.ts`
- `src/hooks/useSSE.ts`
- `src/services/sse.ts`

### Step 2: Add Debug Logging

Add these logs to the `connect()` or `subscribe()` function:

```typescript
export function connect(url: string, options?: SSEOptions) {
  // ADD THIS:
  console.log('[SSE DEBUG] connect() called with URL:', url);
  console.log('[SSE DEBUG] Full URL:', url);
  console.log('[SSE DEBUG] Options:', options);
  
  // Check base URL if used:
  const baseUrl = getCoreBaseUrl?.(); // or however you get it
  console.log('[SSE DEBUG] Base URL:', baseUrl);
  
  if (!baseUrl) {
    console.error('[SSE DEBUG] ERROR: Base URL is undefined!');
    console.error('[SSE DEBUG] VITE_CORE_BASE_URL:', import.meta.env.VITE_CORE_BASE_URL);
    return; // This would prevent EventSource creation
  }
  
  const fullUrl = baseUrl ? `${baseUrl}${url}` : url;
  console.log('[SSE DEBUG] Full SSE URL:', fullUrl);
  
  try {
    console.log('[SSE DEBUG] About to create EventSource...');
    const eventSource = new EventSource(fullUrl);
    console.log('[SSE DEBUG] EventSource created successfully', {
      url: eventSource.url,
      readyState: eventSource.readyState,
      withCredentials: eventSource.withCredentials,
    });
    
    // ... rest of the function
  } catch (error) {
    console.error('[SSE DEBUG] ERROR creating EventSource:', error);
    console.error('[SSE DEBUG] Error details:', error.message, error.stack);
    throw error;
  }
}
```

### Step 3: Check Where SSE is Initialized

Find where `subscribe()` or `connect()` is called (likely in AppShell or main component):

```typescript
// Add logging here too:
useEffect(() => {
  console.log('[SSE DEBUG] Component mounted, initializing SSE');
  console.log('[SSE DEBUG] Environment:', {
    VITE_CORE_BASE_URL: import.meta.env.VITE_CORE_BASE_URL,
    NODE_ENV: import.meta.env.NODE_ENV,
  });
  
  const unsubscribe = subscribe('default', {
    onMessage: (event) => {
      console.log('[SSE DEBUG] Message received:', event);
      // ... handle message
    },
    onError: (error) => {
      console.error('[SSE DEBUG] SSE error:', error);
      // ... handle error
    },
  });
  
  console.log('[SSE DEBUG] subscribe() returned:', unsubscribe);
  
  return () => {
    console.log('[SSE DEBUG] Cleaning up SSE subscription');
    unsubscribe?.();
  };
}, []);
```

### Step 4: Reload and Check

1. **Save the changes**
2. **Reload the dashboard** (hard refresh: Ctrl+Shift+R)
3. **Open DevTools** → Console tab
4. **Look for `[SSE DEBUG]` messages**

### Step 5: Check Network Tab

1. **Open DevTools** → Network tab
2. **Clear the filter** (click "All" or remove "Media" filter)
3. **Look for** `GET /api/stream` request
4. **Check if it shows as "pending"** or if there's an error

### Step 6: Share Results

Share:
- Screenshot of Console tab showing `[SSE DEBUG]` messages
- Screenshot of Network tab (with "All" filter, not "Media")
- Any error messages you see

This will help identify exactly where the SSE initialization is failing.

