# Priority 2 Implementation Summary: Enhanced Polling Hooks

**Date:** 2025-01-XX  
**Status:** ✅ Completed  
**Goal:** Extract polling to reusable hooks with enhanced features

---

## 🎯 What Was Implemented

### 1. Enhanced `usePoller` Hook

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/hooks/usePoller.ts`

**New Features:**
- ✅ **Exponential backoff with jitter** - Prevents thundering herd, reduces server load spikes
- ✅ **Better error handling** - Rate limit detection, retry logic, error callbacks
- ✅ **Progress tracking** - Attempts, duration, in-flight status, backoff state
- ✅ **Visibility pause** - Already implemented in Priority 1
- ✅ **Return value** - Returns progress info for debugging/monitoring

**New Options:**
```typescript
interface UsePollerOptions {
  // ... existing options ...
  onError?: (error: Error) => void;        // Error callback
  onStart?: () => void;                     // Start callback
  maxBackoffMs?: number;                    // Max backoff (default: 8000)
  initialBackoffMs?: number;                // Initial backoff (default: 500)
  jitterFactor?: number;                    // Jitter ±30% (default: 0.3)
  enableBackoff?: boolean;                  // Enable backoff (default: true)
}

interface UsePollerReturn {
  attempts: number;                          // Number of polling attempts
  duration: number;                         // Duration in milliseconds
  isPolling: boolean;                       // Whether polling is active
  inFlight: boolean;                        // Whether request is in-flight
  currentBackoff: number;                   // Current backoff delay
  startTime: number | null;                // When polling started
  lastPollTime: number | null;              // Last successful poll time
}
```

**Jitter Implementation:**
```typescript
// Adds ±30% jitter to prevent synchronized retries
const addJitter = (baseMs: number): number => {
  const jitter = (Math.random() * 2 - 1) * 0.3 * baseMs;
  return Math.max(0, baseMs + jitter);
};
```

---

### 2. `useDraftPolling` Wrapper Hook

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useDraftPolling.ts`

**Purpose:** Simplified interface for polling draft store status

**Features:**
- ✅ Automatic storeId validation (rejects placeholders)
- ✅ Automatic endpoint selection (public vs auth)
- ✅ Draft normalization
- ✅ Status tracking ('generating' | 'ready' | 'error')
- ✅ Error handling
- ✅ Stop conditions (ready, error, has products)

**Usage:**
```typescript
const { draft, status, error, poller, refresh } = useDraftPolling({
  storeId: 'cmk9gmtzc0003jvg84x3yzlqx',
  mode: 'draft',
  enabled: shouldPoll,
  onDraftUpdate: (draft) => setDraft(draft),
  onError: (err) => console.warn('Poll error:', err),
});

// Access progress
console.log(`Polled ${poller.attempts} times over ${poller.duration}ms`);
```

---

### 3. `useJobPolling` Wrapper Hook

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useJobPolling.ts`

**Purpose:** Simplified interface for polling Orchestra job status

**Features:**
- ✅ Terminal state detection (COMPLETED, FAILED, etc.)
- ✅ Automatic polling stop on terminal state
- ✅ Job state management
- ✅ Error handling

**Usage:**
```typescript
const { job, status, error, poller, refresh } = useJobPolling({
  jobId: 'cmk9m2uej0019jv7859lmd9rr',
  enabled: shouldPoll,
  onTerminal: (job) => console.log('Job completed:', job),
  onError: (err) => console.warn('Poll error:', err),
});
```

---

### 4. `useMiJobPolling` Wrapper Hook

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useMiJobPolling.ts`

**Purpose:** Simplified interface for polling MI job status

**Features:**
- ✅ Status normalization (succeeded → completed)
- ✅ Terminal state detection
- ✅ Error type classification (not_found, unauthorized, server_error)
- ✅ Automatic polling stop on completion/failure

**Usage:**
```typescript
const { job, status, error, errorType, poller, refresh } = useMiJobPolling({
  jobId: 'cmk9m2uej0019jv7859lmd9rr',
  enabled: shouldPoll,
  onComplete: (job) => console.log('Job completed:', job),
  onError: (err) => console.warn('Poll error:', err),
});
```

---

## 📊 Benefits

### 1. **DRY Principle**
- Single source of truth for polling logic
- Consistent behavior across all flows
- Easier to maintain and test

### 2. **Better Error Handling**
- Automatic rate limit detection
- Exponential backoff with jitter
- Error callbacks for custom handling
- Error type classification

### 3. **Progress Tracking**
- Monitor polling attempts
- Track duration
- Debug in-flight state
- Monitor backoff delays

### 4. **Resource Efficiency**
- Visibility pause (saves resources)
- Jitter prevents thundering herd
- Automatic stop on terminal states
- Single-flight protection

---

## 🔄 Migration Path

### Option 1: Gradual Migration (Recommended)

Keep existing code working, migrate incrementally:

```typescript
// Old code (still works)
usePoller({
  fn: async (signal) => {
    const data = await apiGET('/endpoint', { signal });
    // Process data
  },
  enabled: shouldPoll,
  intervalMs: 2000,
});

// New code (enhanced features)
const poller = usePoller({
  fn: async (signal) => {
    const data = await apiGET('/endpoint', { signal });
    // Process data
  },
  enabled: shouldPoll,
  intervalMs: 2000,
  onError: (err) => handleError(err),
  enableBackoff: true,
});

// Access progress
console.log(`Polled ${poller.attempts} times`);
```

### Option 2: Use Wrapper Hooks (Simpler API)

Replace manual polling with wrapper hooks:

```typescript
// Before: Manual polling in StoreReviewPage
usePoller({
  fn: async (signal) => {
    const response = await apiGET(`/stores/${storeId}/draft`, { signal });
    // ... manual state management ...
  },
  enabled: shouldPoll,
  intervalMs: 2000,
});

// After: Use wrapper hook
const { draft, status, error, poller } = useDraftPolling({
  storeId,
  mode: 'draft',
  enabled: shouldPoll,
  onDraftUpdate: (draft) => setDraft(draft),
});
```

---

## 📝 Next Steps

### Immediate (Optional)
- [ ] Update `StoreReviewPage` to use `useDraftPolling` wrapper
- [ ] Update other components to use wrapper hooks
- [ ] Add unit tests for new hooks

### Short-Term
- [ ] Migrate `useOrchestraJobPolling` to use enhanced `usePoller`
- [ ] Migrate `useMiJob` to use `useMiJobPolling` wrapper
- [ ] Document migration guide

### Medium-Term
- [ ] Add TypeScript types for all hook options
- [ ] Add JSDoc comments for all hooks
- [ ] Create example components using new hooks

---

## 🧪 Testing

### Manual Testing Checklist

1. **Enhanced `usePoller`:**
   - [ ] Jitter works (check backoff delays vary)
   - [ ] Rate limit backoff works
   - [ ] Progress tracking works (attempts, duration)
   - [ ] Error callbacks fire correctly
   - [ ] Visibility pause works

2. **`useDraftPolling`:**
   - [ ] Polls draft endpoint correctly
   - [ ] Validates storeId (rejects placeholders)
   - [ ] Stops on ready/error
   - [ ] Updates draft state correctly

3. **`useJobPolling`:**
   - [ ] Polls job endpoint correctly
   - [ ] Stops on terminal state
   - [ ] Calls onTerminal callback
   - [ ] Handles errors correctly

4. **`useMiJobPolling`:**
   - [ ] Polls MI job endpoint correctly
   - [ ] Normalizes status correctly
   - [ ] Classifies errors correctly
   - [ ] Stops on completion/failure

---

## 📚 API Reference

### `usePoller`

**Enhanced polling hook with backoff, jitter, and progress tracking**

```typescript
const poller = usePoller({
  fn: (signal: AbortSignal) => Promise<void>;
  enabled?: boolean;
  intervalMs?: number;
  pauseOnHidden?: boolean;
  onStop?: () => void;
  onError?: (error: Error) => void;
  onStart?: () => void;
  maxBackoffMs?: number;
  initialBackoffMs?: number;
  jitterFactor?: number;
  enableBackoff?: boolean;
});

// Returns:
{
  attempts: number;
  duration: number;
  isPolling: boolean;
  inFlight: boolean;
  currentBackoff: number;
  startTime: number | null;
  lastPollTime: number | null;
}
```

### `useDraftPolling`

**Wrapper for polling draft store status**

```typescript
const { draft, status, error, lastErrorAt, draftFound, poller, refresh } = useDraftPolling({
  storeId: string | null | undefined;
  mode?: 'draft' | 'published';
  enabled?: boolean;
  intervalMs?: number;
  onDraftUpdate?: (draft: StoreDraft | null) => void;
  onStop?: () => void;
  onError?: (error: Error) => void;
  stopOnReady?: boolean;
});
```

### `useJobPolling`

**Wrapper for polling Orchestra job status**

```typescript
const { job, status, error, poller, refresh } = useJobPolling({
  jobId: string | null | undefined;
  enabled?: boolean;
  intervalMs?: number;
  onTerminal?: (job: OrchestraJob) => void;
  onStop?: () => void;
  onError?: (error: Error) => void;
});
```

### `useMiJobPolling`

**Wrapper for polling MI job status**

```typescript
const { job, status, error, errorType, poller, refresh } = useMiJobPolling({
  jobId: string | null | undefined;
  enabled?: boolean;
  intervalMs?: number;
  onComplete?: (job: MiJob) => void;
  onError?: (error: Error) => void;
  onStop?: () => void;
});
```

---

## ✅ Completion Status

- [x] Enhanced `usePoller` with jitter, error handling, progress tracking
- [x] Created `useDraftPolling` wrapper hook
- [x] Created `useJobPolling` wrapper hook
- [x] Created `useMiJobPolling` wrapper hook
- [ ] Update `StoreReviewPage` to use wrapper hooks (optional)
- [ ] Add unit tests
- [ ] Document migration guide

---

## 🎉 Summary

Priority 2 is **complete**! The enhanced `usePoller` hook now includes:
- ✅ Exponential backoff with jitter
- ✅ Better error handling
- ✅ Progress tracking
- ✅ Visibility pause (from Priority 1)

Three wrapper hooks are available for common use cases:
- ✅ `useDraftPolling` - Draft store polling
- ✅ `useJobPolling` - Orchestra job polling
- ✅ `useMiJobPolling` - MI job polling

**Next:** Priority 3 (jitter) is already included in Priority 2! The next logical step would be Priority 4 (SSE migration) when time permits.

