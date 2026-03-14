# Polling Improvements Roadmap - Recommendations & Analysis

**Date:** 2025-01-XX  
**Context:** Post-fix analysis of Draft Review Page polling implementation  
**Goal:** Prioritize next-level improvements based on impact vs effort

---

## 🎯 Current State Assessment

### ✅ What's Working Well

1. **Single-flight guards** - Prevents duplicate requests
2. **Exponential backoff** - Handles rate limits gracefully
3. **Terminal state detection** - Stops polling when done
4. **Idempotency tracking** - Prevents duplicate sync-store calls
5. **Consolidated logging** - Helps debugging

### 📊 Other Long-Running Flows Found

Based on codebase analysis, here are other flows that could benefit from similar patterns:

| Flow | Location | Current Status | Polling Method |
|------|----------|---------------|----------------|
| **Draft Generation** | `StoreReviewPage.tsx` | ✅ Just fixed | `usePoller` hook |
| **Menu Autofill** | `imageJobsRoutes.js` | 🟡 Uses SSE | SSE events (`menu.image.updated`) |
| **MI Generation Jobs** | `miGeneration.ts` | 🟡 Multiple polling hooks | `useOrchestraJobPolling`, `useJobPoll`, `useMiJob` |
| **Device Pairing** | `usePairingSession.ts` | 🟡 Uses SSE | SSE + polling hybrid |
| **Creative Templates** | `CreativeEngineShellPage.tsx` | 🟡 Unknown | Need to check |
| **Campaign Updates** | Various | 🟢 Uses SSE | SSE events |

**Key Finding:** Cardbey already has **SSE infrastructure** (`src/realtime/sse.js`, `src/lib/sseClient.ts`) that's used for:
- Device status updates
- Screen/playlist updates  
- Campaign updates
- Menu image autofill

---

## 🚀 Recommended Improvements (Prioritized)

### Priority 1: HIGH - AbortController + Visibility Pause ⭐ **RECOMMENDED NEXT**

**Impact:** High (reduces unnecessary polling, better UX)  
**Effort:** Low (1-2 hours)  
**When:** Next 1-2 days

**What to do:**
```typescript
// Add visibility pause to usePoller
const usePoller = ({ fn, enabled, intervalMs, onStop }) => {
  const [isVisible, setIsVisible] = useState(true);
  
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
  
  // Only poll when visible
  useEffect(() => {
    if (!enabled || !isVisible) return;
    // ... existing polling logic
  }, [enabled, isVisible, intervalMs, fn]);
};
```

**Benefits:**
- Stops polling when tab is hidden (saves resources)
- Automatically resumes when tab becomes visible
- Works with existing `usePoller` hook (reusable)

**Files to modify:**
- `apps/dashboard/cardbey-marketing-dashboard/src/hooks/usePoller.ts`

---

### Priority 2: HIGH - Extract Polling to Reusable Hook ⭐ **RECOMMENDED NEXT**

**Impact:** High (DRY principle, consistency across flows)  
**Effort:** Medium (2-4 hours)  
**When:** Next sprint

**Current State:**
- `usePoller` exists but is basic
- Multiple other polling hooks exist (`useOrchestraJobPolling`, `useJobPoll`, `useMiJob`)
- Each has slightly different implementations

**What to do:**
1. Enhance `usePoller` with:
   - Visibility pause (Priority 1)
   - Jitter in backoff (Priority 3)
   - Better error handling
   - Progress tracking
2. Migrate other polling hooks to use enhanced `usePoller`
3. Create wrapper hooks for specific use cases:
   - `useDraftPolling(storeId, generationRunId)`
   - `useJobPolling(jobId)`
   - `useMiJobPolling(jobId)`

**Benefits:**
- Single source of truth for polling logic
- Consistent behavior across all flows
- Easier to maintain and test

**Files to modify:**
- `apps/dashboard/cardbey-marketing-dashboard/src/hooks/usePoller.ts` (enhance)
- `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useOrchestraJobPolling.ts` (migrate)
- `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useJobPoll.ts` (migrate)
- `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useMiJob.ts` (migrate)

---

### Priority 3: MEDIUM-HIGH - Add Jitter to Backoff

**Impact:** Medium (reduces thundering herd)  
**Effort:** Low (30 minutes)  
**When:** When you have time

**What to do:**
```typescript
// Add jitter to exponential backoff
const backoffWithJitter = (baseMs: number): number => {
  const jitter = Math.random() * 0.3 * baseMs; // ±30% jitter
  return Math.min(baseMs + jitter, 8000);
};

// Usage:
backoffMsRef.current = backoffWithJitter(
  backoffMsRef.current === 0 ? 500 : backoffMsRef.current * 2
);
```

**Benefits:**
- Prevents multiple clients from retrying simultaneously
- Reduces server load spikes
- Better for distributed systems

**Files to modify:**
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`
- Or better: Add to enhanced `usePoller` hook (Priority 2)

---

### Priority 4: MEDIUM - Switch to Server-Sent Events (SSE)

**Impact:** High (real-time updates, no polling overhead)  
**Effort:** Medium-High (1-3 days)  
**When:** When you have 1-3 days for it

**Current State:**
- ✅ SSE infrastructure already exists (`src/realtime/sse.js`)
- ✅ Used for menu autofill, device updates, campaigns
- ❌ Draft generation still uses polling

**What to do:**

1. **Backend:** Emit SSE events for draft status changes
   ```javascript
   // In sync-store handler, after DraftStore update:
   emit('draft.updated', {
     storeId,
     generationRunId,
     status: 'ready' | 'error' | 'generating',
     productsCount,
     lastError,
   });
   ```

2. **Frontend:** Replace polling with SSE subscription
   ```typescript
   const useDraftSSE = (storeId: string, generationRunId: string) => {
     const { subscribe } = useSSE();
     
     useEffect(() => {
       const unsubscribe = subscribe('draft.updated', (event) => {
         if (event.storeId === storeId && event.generationRunId === generationRunId) {
           setDraftStatus(event.status);
           // Update UI
         }
       });
       return unsubscribe;
     }, [storeId, generationRunId]);
   };
   ```

**Benefits:**
- Real-time updates (no polling delay)
- Reduced server load (no constant polling)
- Better UX (instant updates)
- Leverages existing SSE infrastructure

**Trade-offs:**
- More complex error handling (SSE reconnection)
- Requires backend changes
- Need to handle SSE connection failures gracefully

**Files to modify:**
- `apps/core/cardbey-core/src/routes/miRoutes.js` (emit events)
- `apps/core/cardbey-core/src/routes/stores.js` (emit events)
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx` (use SSE)
- `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useDraftSSE.ts` (new hook)

---

### Priority 5: LOW-MEDIUM - Evaluate Inngest/Trigger.dev

**Impact:** High (professional job queue, retries, monitoring)  
**Effort:** High (1-2 weeks for migration)  
**When:** Next major refactor / when adding more background jobs

**What to do:**
- Evaluate Inngest or Trigger.dev for background job management
- Migrate long-running flows to job queue
- Get built-in retries, monitoring, webhooks

**Benefits:**
- Professional job queue with retries
- Built-in monitoring and observability
- Webhook support (no polling needed)
- Better error handling and recovery

**Trade-offs:**
- Additional dependency
- Migration effort
- Learning curve
- May be overkill for current scale

**When to consider:**
- If you're adding 3+ more long-running flows
- If you need job scheduling/retries
- If you want professional observability

---

## 💡 My Recommendation

Based on the codebase analysis:

### **Immediate Next Steps (This Week):**

1. **Priority 1: Visibility Pause** ⭐
   - Quick win (1-2 hours)
   - Immediate resource savings
   - Better UX (no wasted polling)

2. **Priority 2: Extract to Reusable Hook** ⭐
   - Medium effort, high value
   - Sets foundation for future improvements
   - Can be done incrementally

### **Short-Term (Next Sprint):**

3. **Priority 3: Jitter in Backoff**
   - Easy addition to enhanced hook
   - Good practice for distributed systems

### **Medium-Term (When Time Permits):**

4. **Priority 4: SSE for Draft Generation**
   - You already have SSE infrastructure!
   - Menu autofill already uses it successfully
   - Natural evolution of the system
   - **This is the most valuable long-term improvement**

### **Long-Term (Major Refactor):**

5. **Priority 5: Job Queue (Inngest/Trigger.dev)**
   - Only if you're adding many more background jobs
   - Current scale may not justify it yet

---

## 🎯 Answer to Your Question

> "Do you already have many other long-running generation flows, or is this Draft → Products the main heavy one right now?"

**Answer:** 

**Draft → Products is the main heavy one**, but there are several other flows:

1. **Menu Autofill** - Already uses SSE ✅ (good pattern to follow!)
2. **MI Generation Jobs** - Uses multiple polling hooks (could benefit from unified approach)
3. **Device Pairing** - Uses SSE + polling hybrid
4. **Creative Templates** - Unknown (need to check)

**Key Insight:** You already have **SSE infrastructure** that's working well for menu autofill. The natural next step would be to extend SSE to draft generation (Priority 4), which would:
- Leverage existing infrastructure
- Follow a pattern you've already proven works
- Eliminate polling overhead
- Provide real-time updates

---

## 📋 Implementation Plan

### Phase 1: Quick Wins (This Week)
- [ ] Add visibility pause to `usePoller`
- [ ] Add jitter to backoff (while you're in there)

### Phase 2: Foundation (Next Sprint)
- [ ] Enhance `usePoller` with all improvements
- [ ] Create `useDraftPolling` wrapper hook
- [ ] Migrate one other polling hook as proof of concept

### Phase 3: SSE Migration (When Time Permits)
- [ ] Add SSE events for draft status changes (backend)
- [ ] Create `useDraftSSE` hook (frontend)
- [ ] Migrate `StoreReviewPage` to use SSE
- [ ] Keep polling as fallback for SSE failures

### Phase 4: Job Queue Evaluation (Future)
- [ ] Evaluate Inngest/Trigger.dev when adding more flows
- [ ] Consider migration if you hit 5+ background job types

---

## 🤔 My Take

**For Cardbey's current state, I'd recommend:**

1. **This week:** Visibility pause (quick win)
2. **Next sprint:** Enhanced `usePoller` hook (foundation)
3. **Next month:** SSE for draft generation (biggest impact)

**Why SSE over job queue right now:**
- You already have SSE infrastructure ✅
- Menu autofill proves it works ✅
- Lower effort than job queue migration
- Better fit for real-time UI updates
- Can be done incrementally (keep polling as fallback)

**Why not job queue yet:**
- Current scale doesn't justify it
- SSE is simpler and already proven
- Can always migrate later if needed

---

## 📝 Summary

**Current State:**
- ✅ Draft generation polling is solid (just fixed)
- ✅ SSE infrastructure exists and works
- 🟡 Other flows use various polling patterns (could be unified)

**Recommended Path:**
1. **Quick win:** Visibility pause (1-2 hours)
2. **Foundation:** Enhanced `usePoller` hook (1 sprint)
3. **Big impact:** SSE for draft generation (when time permits)
4. **Future:** Job queue evaluation (if scale demands it)

**The SSE migration (Priority 4) is the most valuable long-term improvement** because:
- You already have the infrastructure
- It's proven to work (menu autofill)
- It eliminates polling overhead
- It provides real-time updates
- It's a natural evolution of your system

Would you like me to implement any of these? I'd suggest starting with **Priority 1 (Visibility Pause)** as it's a quick win that provides immediate value. 🚀

