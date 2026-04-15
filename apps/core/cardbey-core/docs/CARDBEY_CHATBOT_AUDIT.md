# Cardbey Chatbot/Assistant Audit Report

**Date:** 2025-01-21  
**Scope:** Backend (cardbey-core) + Notes on Frontend (marketing dashboard)

---

## Executive Summary

The Cardbey codebase has **backend chatbot infrastructure** but the assistant routes are **NOT currently mounted** in the server. There are two assistant route files (`assistant.js` and `assistant-complete.js`) that provide context-aware chatbot endpoints, but they need to be integrated into the main server.

**Key Findings:**
- ✅ Backend chatbot API routes exist but are **not mounted**
- ✅ Context-aware system (extracts `mode` from `x-cardbey-context` header)
- ✅ Guest/user authentication support
- ✅ Journey detection system
- ⚠️ **Frontend components** would be in separate `cardbey-marketing-dashboard` codebase (not audited here)

---

## 1. Backend Chatbot API Endpoints

### File: `src/routes/assistant.js`
**Status:** ✅ EXISTS but **NOT MOUNTED** in `src/server.js`

**Exported Router:** Default export `router`

**Endpoints:**
1. **POST `/api/assistant/guest`**
   - Generates guest JWT token (24h expiry)
   - Returns `{ guestId, token, expiresIn, limitations }`
   - **Authentication:** None (public)

2. **POST `/api/assistant/chat`**
   - Sends message to assistant
   - **Input:** `{ message: string }`
   - **Input Header:** `x-cardbey-context` (JSON string with `mode`, `pageId`, etc.)
   - **Output:** `{ reply: string, journeyCard?: {...} }`
   - **Authentication:** `requireUserOrGuest` middleware
   - **Features:**
     - Context-aware responses based on `mode` (home, store, screens, marketing, performer, explore)
     - Journey intent detection (launches journey cards for specific intents)
     - Mock responses (OpenAI integration TODO'd but not implemented)

3. **POST `/api/assistant/action`**
   - Executes quick actions
   - **Input:** `{ intent: string, payload?: object }`
   - **Input Header:** `x-cardbey-context`
   - **Output:** Varies by intent (cards, next steps, teasers)
   - **Authentication:** `requireUserOrGuest` middleware
   - **Supported Intents:**
     - `show_trending` - Returns trending cards
     - `create_store` - Returns teaser carousel for guests, setup URL for users
     - `design_flyer` - Returns asset preview + designer URL
     - `connect_screens` - Returns teaser carousel or setup URL

4. **GET `/api/assistant/summary`**
   - Returns quick metrics (campaigns, reach, spend, screens)
   - **Output:** `{ campaigns, reach7d, spend7d, screensOnline }`
   - **Authentication:** `requireUserOrGuest` middleware
   - **Note:** Currently returns mock data (TODO: query real data)

**Context Extraction:**
- Extracts `context` from `x-cardbey-context` request header
- Expected format: JSON string with `{ mode?: string, pageId?: string, screenId?: string, ... }`
- Modes supported: `home`, `store`, `screens`, `marketing`, `performer`, `explore`

**Mode-Aware Responses:**
- `generateMockReply()` uses `context.mode` to customize greetings and hints
- Different greetings per mode (e.g., "🏪 Store Mode!" for `store`, "📺 Screens Mode!" for `screens`)

**Journey Detection:**
- `detectJourneyIntent()` searches message for patterns like "launch store", "weekend promo", "connect screen"
- Returns journey cards with template info, steps, and action buttons

### File: `src/routes/assistant-complete.js`
**Status:** ✅ EXISTS (appears to be an alternative/simpler version)

**Differences from `assistant.js`:**
- No journey detection
- Simpler action handling (no teaser carousels for guests)
- Less comprehensive mode-aware responses
- Same endpoints structure

**Note:** This file may be legacy or experimental. Recommend using `assistant.js` instead.

---

## 2. Backend AI/Design Assistant (Separate from Chatbot)

### File: `src/routes/ai.js`
**Status:** ✅ MOUNTED at `/api/ai`

**Purpose:** AI-powered design generation (plan-design, generate-design) - **NOT a chatbot**

**Note:** This is for the "AI Design Assistant" in Contents Studio (background image generation, text generation), not a conversational chatbot.

### File: `src/routes/studio.js`
**Status:** ✅ MOUNTED at `/api/studio`

**Purpose:** Studio suggestions endpoint (`/api/studio/suggestions`) - **NOT a chatbot**

**Note:** This returns design suggestions based on snapshots/events, not conversational chat.

---

## 3. Database Schema

### Model: `AssistantSuggestion` (in `prisma/schema.prisma`)
**Location:** `prisma/schema.prisma` (lines 184-196)

**Purpose:** Stores AI-generated suggestions per user and mode

**Schema:**
```prisma
model AssistantSuggestion {
  id         String   @id @default(cuid())
  userId     String
  mode       String   // 'home'|'store'|'screens'|'marketing'|'performer'
  templateId String?
  title      String
  reason     String?
  score      Float    @default(0)
  createdAt  DateTime @default(now())
  
  @@index([userId, mode])
  @@index([score])
}
```

**Note:** This model exists but is **not currently used** by the assistant routes (no queries to this table in assistant.js).

---

## 4. Middleware & Authentication

### File: `src/middleware/guestAuth.js`
**Status:** ✅ EXISTS

**Exports:**
- `requireUserOrGuest` - Middleware that allows both authenticated users and guest tokens
- `canPerformAction` - Checks if guest/user can perform a specific action

**Usage:**
- Used by all `/api/assistant/*` routes
- Supports JWT tokens for both users and guests
- Guests have rate limits (20 requests/day) and restricted actions

---

## 5. Server Mounting Status

### File: `src/server.js`

**Status:** ❌ **Assistant routes are NOT mounted**

**Current imports (lines 17-47):** No assistant router imported

**Current route mounts (lines 340-358):** No `/api/assistant` route mounted

**To enable:** Need to add:
```javascript
import assistantRouter from './routes/assistant.js';
// ...
app.use('/api/assistant', assistantRouter);
```

---

## 6. Frontend Components (NOT IN THIS REPO)

**Note:** The `cardbey-core` repository is the **backend only**. Frontend chatbot components would be in:
- `cardbey-marketing-dashboard` (React/Vite app)

**To audit frontend:**
1. Search for React components with names like:
   - `Assistant`, `Chatbot`, `HelpWidget`, `FloatingAssistant`
   - `Chat`, `Support`, `Help`
2. Check main layout files:
   - `App.tsx`, `AppShell.tsx`, `MainLayout.tsx`, `DashboardLayout.tsx`
3. Look for API calls to `/api/assistant/chat`, `/api/assistant/action`
4. Check for context providers/hooks:
   - `AssistantProvider`, `ChatContext`, `useAssistant`, `useChat`

**Frontend integration points to check:**
- Does the frontend send `x-cardbey-context` header?
- Is there a floating chat bubble component?
- Is the assistant rendered globally or per-page?
- Are there React hooks/context for assistant state?

---

## 7. Current Limitations

### Backend:
1. ❌ **Routes not mounted** - Assistant endpoints won't work until mounted in `server.js`
2. ❌ **OpenAI integration incomplete** - `assistant.js` checks for `OPENAI_API_KEY` but always uses mock replies (TODO comment on line 97 in assistant-complete.js)
3. ❌ **No conversation history** - Chat endpoint doesn't store or retrieve message history
4. ❌ **No streaming** - Responses are synchronous (no SSE/WebSocket for streaming replies)
5. ❌ **Mock data only** - `/summary` endpoint returns hardcoded mock metrics
6. ⚠️ **Context header optional** - If `x-cardbey-context` is missing, assistant defaults to `mode: 'home'` but works without context
7. ⚠️ **Two route files** - Both `assistant.js` and `assistant-complete.js` exist (possible duplication/confusion)

### Frontend (Not Audited):
- ❓ Unknown if frontend components exist
- ❓ Unknown if context header is sent
- ❓ Unknown if assistant is rendered globally or per-page
- ❓ Unknown if there's a floating bubble UI

---

## 8. What Would Need to Change for Unified Page-Aware Assistant

### Backend Changes:

1. **Mount Assistant Routes:**
   ```javascript
   // In src/server.js
   import assistantRouter from './routes/assistant.js';
   app.use('/api/assistant', assistantRouter);
   ```

2. **Implement OpenAI Integration:**
   - Complete the TODO in `assistant.js` line 189-194
   - Use `src/services/aiService.js` for OpenAI calls
   - Add conversation history context

3. **Add Preloaded Topics Endpoint:**
   ```javascript
   // GET /api/assistant/topics?mode=marketing
   router.get('/topics', requireUserOrGuest, async (req, res) => {
     const { mode } = req.query;
     const topics = getTopicsForMode(mode);
     res.json({ topics });
   });
   ```

4. **Add Conversation History:**
   - Store messages in database (new `AssistantMessage` model)
   - Include conversation context in OpenAI calls

5. **Remove Duplicate Route File:**
   - Delete or consolidate `assistant-complete.js` (use `assistant.js` as canonical)

### Frontend Changes (Estimated - Not Audited):

1. **Create/Update Floating Assistant Component:**
   - Render chat bubble in bottom-right (or configurable position)
   - Toggle open/closed state
   - Display messages in chat UI

2. **Mount in Root Layout:**
   - Add assistant component to `AppShell.tsx` or root layout
   - Make it available on all pages (or conditionally per route)

3. **Send Context Header:**
   - Detect current route/page
   - Extract `pageId`, `screenId`, `mode` from route
   - Send as `x-cardbey-context` header in all `/api/assistant/*` requests

4. **Add Preloaded Topics UI:**
   - Fetch topics from `/api/assistant/topics?mode={currentMode}`
   - Display as quick-action buttons or suggestions above chat input

5. **Add React Context/Hooks:**
   - `AssistantProvider` to manage state (messages, isOpen, currentMode)
   - `useAssistant()` hook for components to interact with assistant
   - `useAssistantTopics(mode)` hook to fetch topics per page

6. **Per-Page Configuration:**
   - Allow pages to pass custom `pageId` or `topics` prop to assistant
   - Example: `<Assistant pageId="screen-manager" mode="screens" />`

---

## 9. Recommended Next Steps

### Phase 1: Enable Existing Backend
1. ✅ Mount `assistantRouter` in `src/server.js`
2. ✅ Test endpoints with Postman/curl
3. ✅ Verify context header extraction works

### Phase 2: Frontend Audit (Marketing Dashboard)
1. 🔍 Search marketing dashboard codebase for assistant/chatbot components
2. 🔍 Check if any components call `/api/assistant/*` endpoints
3. 🔍 Identify where assistant should be mounted (root layout vs per-page)

### Phase 3: Unify & Enhance
1. Remove duplicate route file (`assistant-complete.js`)
2. Implement OpenAI integration for real AI responses
3. Add preloaded topics endpoint
4. Create/update floating assistant component
5. Add conversation history storage
6. Implement per-page topic configuration

---

## 10. File Reference Summary

### Backend Files:
- `src/routes/assistant.js` - **Main assistant routes (NOT MOUNTED)**
- `src/routes/assistant-complete.js` - **Alternative routes (possibly legacy)**
- `src/middleware/guestAuth.js` - **Guest/user authentication**
- `src/server.js` - **Server setup (needs assistant route mounting)**
- `prisma/schema.prisma` - **Database schema (has AssistantSuggestion model)**

### Frontend Files (Not in this repo - check marketing dashboard):
- ❓ Root layout component (e.g., `App.tsx`, `AppShell.tsx`)
- ❓ Assistant component (if exists: `components/Assistant.tsx`, `components/Chatbot.tsx`)
- ❓ Assistant hooks/context (if exists: `hooks/useAssistant.ts`, `context/AssistantContext.tsx`)

---

## Conclusion

The backend has a **solid foundation** for a context-aware chatbot with:
- ✅ Context extraction from headers
- ✅ Mode-aware responses
- ✅ Guest/user support
- ✅ Journey detection
- ✅ Quick actions system

However, it needs:
- ❌ Routes mounted in server
- ❌ OpenAI integration completed
- ❌ Frontend components created/integrated
- ❌ Preloaded topics system
- ❌ Conversation history

**Priority:** Mount the routes first, then audit the frontend to see what exists there.

