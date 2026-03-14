# MI Unification Audit Report

**Date:** 2026-01-05  
**Goal:** Unify all UI entry points through a single MI interface  
**Status:** Analysis Complete - Ready for Implementation Planning

---

## Executive Summary

The current Cardbey dashboard has **multiple competing entry points** for MI functionality, creating a fragmented user experience. This audit identifies all UI components, API endpoints, and direct business logic calls that need to be unified under a single MI entry point.

### Key Findings

1. **3+ Chat Interfaces** competing for user attention
2. **20+ Direct API Endpoints** called from UI components
3. **15+ Pages** with direct business logic buttons
4. **Multiple Debug Widgets** scattered across the app
5. **No Single Source of Truth** for user intent

---

## 1. Current UI Entry Points

### 1.1 Chat Interfaces (COMPETING)

| Component | Location | Purpose | API Endpoint | Status |
|-----------|----------|---------|--------------|--------|
| **MiConsole** | `src/components/mi/MiConsole.tsx` | Agent OS chat with plan execution | `/api/agent/chat` | ✅ Active |
| **AskCardbeyButton** | `src/components/ai/AskCardbeyButton.tsx` | RAG-based Q&A chat | `/api/rag/ask` | ✅ Active |
| **MI Chat (Landing)** | `src/pages/MIObjectLandingPage.tsx` | QR code landing page chat | `/api/mi/chat` | ✅ Active |
| **WatcherChat** | `src/components/watcher/WatcherChatButton.tsx` | System diagnostics chat | `/api/watcher/chat` | ✅ Active |
| **PerformerChat** | `src/features/performer/components/PerformerChatBar.tsx` | Streaming chat for Performer | `/api/performer/chat` | ✅ Active |

**Problem:** Users see multiple floating buttons (MI, AskCardbey, etc.) with overlapping functionality.

**Recommendation:** Consolidate into **one persistent MI Bubble** that routes to appropriate backend based on context.

---

### 1.2 Quick Start / Store Creation

| Component | Location | Direct API Call | Should Route Through |
|-----------|----------|-----------------|---------------------|
| **FeaturesPage** | `src/pages/public/FeaturesPage.tsx` | `quickStartCreateJob()` → `/api/mi/orchestra/start` | ✅ Already uses Orchestra |
| **CreateStoreWithAI** | `src/components/dashboard/CreateStoreWithAI.tsx` | Direct store creation | `POST /api/mi/intent` |
| **WelcomeCreateStore** | `src/pages/onboarding/WelcomeCreateStore.tsx` | Direct store creation | `POST /api/mi/intent` |
| **BusinessOnboardingWizard** | `src/features/business-builder/onboarding/BusinessOnboardingWizard.tsx` | Direct API calls | `POST /api/mi/intent` |

**Current Flow:**
```
User fills form → quickStartCreateJob() → POST /api/mi/orchestra/start → Job created
```

**Target Flow:**
```
User fills form → MI Bubble input → POST /api/mi/intent { userMessage, context } → MI decides → Orchestra job
```

---

### 1.3 Content Generation Buttons

| Component | Location | Direct API Call | Should Route Through |
|-----------|----------|-----------------|---------------------|
| **PropertiesPanel** | `src/features/content-studio/components/PropertiesPanel.tsx` | "Generate with MI" button | `POST /api/mi/intent` |
| **ContentStudioHome** | `src/features/content-studio/components/ContentStudioHome.tsx` | "AI Generate" card | `POST /api/mi/intent` |
| **AiImageGenerationCard** | `src/features/performer/components/AiImageGenerationCard.tsx` | `/api/ai/image/generate` | `POST /api/mi/intent` |
| **StoreDraftReview** | `src/features/storeDraft/StoreDraftReview.tsx` | "Generate products" button | `POST /api/mi/intent` |

**Problem:** Buttons directly call specialized APIs instead of going through MI intent system.

---

### 1.4 Promo Creation Entry Points

| Component | Location | Direct API Call | Should Route Through |
|-----------|----------|-----------------|---------------------|
| **StartPromoPage** | `src/pages/promo/StartPromoPage.tsx` | `createPromoDraftAndNavigate()` | `POST /api/mi/intent` |
| **PromoPage** | `src/pages/promo/PromoPage.jsx` | "New Promo from Idea" | `POST /api/mi/intent` |
| **StoreDraftReview** | `src/features/storeDraft/StoreDraftReview.tsx` | "Smart Content Upgrade" | `POST /api/mi/intent` |
| **MiPromotionCreatorPage** | `src/features/content-studio/promo/MiPromotionCreatorPage.tsx` | Direct promo creation | `POST /api/mi/intent` |

**Current:** Multiple entry points with different flows.

**Target:** All promo creation goes through MI intent → MI decides which tool to use.

---

### 1.5 Debug Widgets (SCATTERED)

| Component | Location | Purpose | Should Be |
|-----------|----------|---------|-----------|
| **BusinessBuilderDebugPanel** | `src/features/business-builder/dev/BusinessBuilderDebugPanel.tsx` | Business Builder state debug | Developer Mode in MI drawer |
| **DevContextSwitcher** | `src/components/dev/DevContextSwitcher.tsx` | Core URL switcher | Settings in MI drawer |
| **StoreDraftReview Debug Panel** | `src/features/storeDraft/StoreDraftReview.tsx` | Job/SSE status debug | Job status in MI drawer |
| **Player Debug Toggle** | `src/pages/device/Player.jsx` | Device player debug | Device context in MI drawer |

**Problem:** Debug tools are scattered and inconsistent.

**Recommendation:** Consolidate into **Developer Mode** section inside MI drawer.

---

## 2. Backend API Endpoints

### 2.1 Current MI Routes (`/api/mi/*`)

| Endpoint | Method | Purpose | Should Be Unified? |
|----------|--------|---------|-------------------|
| `/api/mi/orchestra/start` | POST | Start Orchestra job | ✅ Keep, but route through `/api/mi/intent` |
| `/api/mi/orchestra/job/:id/run` | POST | Run job | ✅ Keep (internal) |
| `/api/mi/orchestra/job/:id` | GET | Get job status | ✅ Keep (internal) |
| `/api/mi/chat` | POST | Object-aware chat | ✅ Keep, but route through `/api/mi/intent` |
| `/api/mi/act` | POST | Execute action | ✅ Keep, but route through `/api/mi/intent` |
| `/api/mi/resolve` | POST | Resolve MI for object | ✅ Keep (internal) |
| `/api/mi/generate` | POST | Create generation job | ⚠️ Deprecate → use `/api/mi/intent` |
| `/api/mi/promo/from-product` | POST | Create promo from product | ⚠️ Deprecate → use `/api/mi/intent` |
| `/api/mi/promo/from-draft` | POST | Create promo from draft | ⚠️ Deprecate → use `/api/mi/intent` |
| `/api/mi/promo/from-idea` | POST | Create promo from idea | ⚠️ Deprecate → use `/api/mi/intent` |

**Total:** 29 MI routes identified in `miRoutes.js`

---

### 2.2 Agent OS Routes (`/api/agent/*`)

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/agent/chat` | POST | Unified chat gateway | ✅ Active (used by MiConsole) |
| `/api/agent/plan` | POST | Create plan | ✅ Active |
| `/api/agent/tool` | POST | Execute tool | ✅ Active |

**Note:** Agent OS routes are already unified. MiConsole uses these correctly.

---

### 2.3 Direct Business Logic APIs (SHOULD BE ROUTED THROUGH MI)

| Endpoint | Called From | Should Route Through |
|----------|-------------|---------------------|
| `/api/stores` (POST) | Multiple components | `POST /api/mi/intent` |
| `/api/ai/image/generate` | AiImageGenerationCard | `POST /api/mi/intent` |
| `/api/ai/copy/generate` | Various | `POST /api/mi/intent` |
| `/api/menu/state/:storeId` | MenuPage | ✅ Keep (read-only) |
| `/api/devices/*` | DevicesPage | ✅ Keep (read-only), but actions → MI |

---

## 3. Proposed Architecture

### 3.1 Single MI Entry Interface

```
┌─────────────────────────────────────────┐
│         MI Bubble (Persistent)          │
│  ┌───────────────────────────────────┐  │
│  │  Chat Input                       │  │
│  │  "Create a store from..."        │  │
│  └───────────────────────────────────┘  │
│                                          │
│  ┌───────────────────────────────────┐  │
│  │  Context Drawer (Expandable)      │  │
│  │  • Current Store                  │  │
│  │  • Active Job                     │  │
│  │  • Stage Progress                 │  │
│  │  • Last Actions                   │  │
│  │  • Developer Mode (if enabled)    │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Key Features:**
- **One persistent bubble** (bottom-right, always visible)
- **Context drawer** shows current state (store, job, stage)
- **Developer Mode** toggle (shows debug info, raw API calls)
- **No competing chat boxes** (AskCardbey, Watcher, etc. become MI modes)

---

### 3.2 New API Contract: `/api/mi/intent`

**Request:**
```json
POST /api/mi/intent
{
  "userMessage": "Create a store from this website: example.com",
  "context": {
    "storeId": "abc123",
    "tenantId": "user123",
    "page": "/dashboard/stores",
    "selection": {
      "kind": "product",
      "id": "prod456",
      "name": "Pizza"
    }
  }
}
```

**Response:**
```json
{
  "ok": true,
  "intent": {
    "type": "create_store",
    "confidence": 0.95,
    "parameters": {
      "sourceType": "url",
      "websiteUrl": "example.com"
    }
  },
  "actions": [
    {
      "type": "orchestra.start",
      "payload": {
        "goal": "build_store",
        "rawInput": "Create a store from this website: example.com"
      }
    }
  ],
  "ui": {
    "navigateTo": "/app/store/:storeId/review",
    "openPanel": "job_progress",
    "showNotification": "Store creation started"
  }
}
```

**MI Decides:**
- Which tools to call (`orchestra.start`, `promo.create`, etc.)
- Which pages to update
- Which UI panels to open
- What notifications to show

---

## 4. Migration Plan

### Phase 1: Create Single MI Entry Point

**Tasks:**
1. ✅ Create unified `MiBubble` component (replaces MiConsole + AskCardbeyButton)
2. ✅ Create `ContextDrawer` component (shows store, job, stage, progress)
3. ✅ Implement `POST /api/mi/intent` endpoint
4. ✅ Add Developer Mode toggle in drawer

**Files to Create:**
- `src/components/mi/MiBubble.tsx` (unified entry point)
- `src/components/mi/ContextDrawer.tsx` (context display)
- `src/routes/miRoutes.js` → Add `/api/mi/intent` handler

**Files to Modify:**
- `src/app/AppShell.tsx` → Replace MiConsole + AskCardbeyButton with MiBubble
- `src/components/mi/MiConsole.tsx` → Deprecate (keep for migration)
- `src/components/ai/AskCardbeyButton.tsx` → Deprecate (keep for migration)

---

### Phase 2: Convert Quick Start Flow

**Tasks:**
1. Replace `quickStartCreateJob()` calls with MI intent
2. Update `FeaturesPage.tsx` to use MiBubble input
3. Update `CreateStoreWithAI.tsx` to use MI intent

**Before:**
```typescript
const result = await quickStartCreateJob(navigate, payload);
```

**After:**
```typescript
const result = await miIntent({
  userMessage: "Create a store from this website: example.com",
  context: { page: "/features", selection: { ... } }
});
// MI decides to call orchestra.start internally
```

---

### Phase 3: Convert Content Generation

**Tasks:**
1. Replace "Generate with MI" buttons with MiBubble input
2. Replace "AI Generate" cards with MiBubble suggestions
3. Update `PropertiesPanel.tsx` to use MI intent

**Before:**
```typescript
<Button onClick={handleGenerateWithMI}>
  Generate with MI
</Button>
```

**After:**
```typescript
<Button onClick={() => miBubble.openWithContext({
  message: "Generate promo for this product",
  context: { productId: product.id }
})}>
  Generate with MI
</Button>
```

---

### Phase 4: Convert Promo Creation

**Tasks:**
1. Replace `createPromoDraftAndNavigate()` with MI intent
2. Update `StartPromoPage.tsx` to use MiBubble
3. Update `PromoPage.jsx` to use MI intent

**Before:**
```typescript
await createPromoDraftAndNavigate({
  idea: idea.trim(),
  productId: targetItemId,
  ...
});
```

**After:**
```typescript
await miIntent({
  userMessage: `Create a promo for ${idea}`,
  context: { productId: targetItemId, page: "/promo" }
});
```

---

### Phase 5: Consolidate Debug Widgets

**Tasks:**
1. Move all debug panels into Developer Mode in ContextDrawer
2. Remove scattered debug widgets
3. Add debug toggle in drawer settings

**Files to Modify:**
- `src/components/mi/ContextDrawer.tsx` → Add Developer Mode section
- Remove `BusinessBuilderDebugPanel.tsx` (move to drawer)
- Remove debug panels from `StoreDraftReview.tsx` (move to drawer)

---

## 5. Implementation Recommendations

### 5.1 Backend: Intent Router

**Create:** `src/mi/miIntentRouter.ts`

```typescript
export async function routeIntent(
  userMessage: string,
  context: MiContext
): Promise<IntentResponse> {
  // 1. Infer intent using AI + fallback
  const intent = await inferIntent(userMessage, context);
  
  // 2. Map intent to actions
  const actions = mapIntentToActions(intent, context);
  
  // 3. Determine UI updates
  const uiUpdates = determineUIUpdates(intent, actions);
  
  return { intent, actions, ui: uiUpdates };
}
```

**Intent Types:**
- `create_store` → `orchestra.start` with `goal: 'build_store'`
- `create_promo` → `promo.create` or `orchestra.start` with `goal: 'create_promo'`
- `generate_content` → `ai.generate` or `orchestra.start`
- `manage_devices` → `device.*` tools
- `chat` → `agent.chat` (fallback)

---

### 5.2 Frontend: MiBubble Component

**Create:** `src/components/mi/MiBubble.tsx`

```typescript
export function MiBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState<MiContext>({});
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  
  const handleSubmit = async (message: string) => {
    const response = await miIntent({
      userMessage: message,
      context: { ...context, page: location.pathname }
    });
    
    // MI decides what to do
    if (response.actions) {
      await executeActions(response.actions);
    }
    
    if (response.ui?.navigateTo) {
      navigate(response.ui.navigateTo);
    }
    
    if (response.ui?.openPanel) {
      openPanel(response.ui.openPanel);
    }
  };
  
  return (
    <>
      <FloatingButton onClick={() => setIsOpen(true)} />
      <ChatPanel isOpen={isOpen} onSubmit={handleSubmit} />
      <ContextDrawer 
        context={context}
        activeJob={activeJob}
        developerMode={isDeveloperMode}
      />
    </>
  );
}
```

---

### 5.3 Context Management

**Enhance:** `src/components/mi/MiConsoleContext.tsx`

```typescript
export type MiContext = {
  // Current page
  pageType?: 'dashboard' | 'store' | 'promo' | 'devices' | 'content-studio';
  route?: string;
  
  // Active entities
  storeId?: string;
  draftId?: string;
  promoId?: string;
  deviceId?: string;
  jobId?: string;
  
  // Selection
  selection?: {
    kind: 'product' | 'asset' | 'content' | 'device';
    id: string;
    name: string;
  };
  
  // Job progress
  activeJob?: {
    id: string;
    status: string;
    currentStage?: string;
    progressPct: number;
  };
  
  // Last actions
  lastActions?: Array<{
    type: string;
    timestamp: string;
    result: 'success' | 'error';
  }>;
};
```

---

## 6. Risk Assessment

### High Risk
- **Breaking existing flows:** Quick Start, Promo creation are critical paths
- **User confusion:** Changing familiar UI patterns
- **Performance:** Adding intent routing layer adds latency

### Medium Risk
- **Backend complexity:** Intent router needs to handle all edge cases
- **Context management:** Ensuring context is always accurate
- **Migration timeline:** Phased approach may leave inconsistencies

### Low Risk
- **Debug widgets:** Non-critical, can be moved gradually
- **Chat interfaces:** Users can adapt to single entry point

---

## 7. Success Metrics

### User Experience
- ✅ **Single entry point:** Only one MI bubble visible
- ✅ **Context awareness:** MI knows what user is looking at
- ✅ **Consistent flows:** All operations go through MI

### Technical
- ✅ **API consolidation:** 20+ direct calls → 1 intent endpoint
- ✅ **Code reduction:** Remove duplicate chat components
- ✅ **Maintainability:** Single source of truth for user intent

---

## 8. Next Steps

### Immediate (Week 1)
1. ✅ Create `MiBubble` component skeleton
2. ✅ Create `ContextDrawer` component skeleton
3. ✅ Design `/api/mi/intent` endpoint contract
4. ✅ Write migration plan document

### Short-term (Weeks 2-3)
1. ✅ Implement `/api/mi/intent` backend
2. ✅ Implement `MiBubble` frontend
3. ✅ Migrate Quick Start flow
4. ✅ Test with real users

### Medium-term (Weeks 4-6)
1. ✅ Migrate Content Generation
2. ✅ Migrate Promo Creation
3. ✅ Consolidate Debug Widgets
4. ✅ Remove deprecated components

---

## 9. Files Requiring Changes

### Backend
- `src/routes/miRoutes.js` → Add `/api/mi/intent` handler
- `src/mi/miIntentRouter.ts` → **NEW** Intent routing logic
- `src/mi/miRuntime.ts` → Enhance with intent inference

### Frontend
- `src/components/mi/MiBubble.tsx` → **NEW** Unified entry point
- `src/components/mi/ContextDrawer.tsx` → **NEW** Context display
- `src/app/AppShell.tsx` → Replace MiConsole + AskCardbeyButton
- `src/lib/quickStart.ts` → Refactor to use MI intent
- `src/pages/public/FeaturesPage.tsx` → Use MiBubble
- `src/components/dashboard/CreateStoreWithAI.tsx` → Use MI intent
- `src/features/content-studio/components/PropertiesPanel.tsx` → Use MI intent
- `src/pages/promo/StartPromoPage.tsx` → Use MI intent
- `src/features/storeDraft/StoreDraftReview.tsx` → Use MI intent

### Deprecate (Keep for Migration)
- `src/components/mi/MiConsole.tsx` → Deprecate
- `src/components/ai/AskCardbeyButton.tsx` → Deprecate
- `src/features/business-builder/dev/BusinessBuilderDebugPanel.tsx` → Move to drawer

---

## 10. Conclusion

The current Cardbey dashboard has **fragmented MI entry points** that create confusion and maintenance burden. Unifying everything through a **single MI Bubble with Context Drawer** will:

1. ✅ **Simplify user experience:** One entry point, consistent behavior
2. ✅ **Reduce code complexity:** Single source of truth for intent
3. ✅ **Enable better context awareness:** MI knows what user is doing
4. ✅ **Improve maintainability:** Less duplicate code, clearer architecture

**Recommendation:** Proceed with phased migration, starting with Quick Start flow, then Content Generation, then Promo Creation, and finally Debug Widgets.

---

**End of Report**





