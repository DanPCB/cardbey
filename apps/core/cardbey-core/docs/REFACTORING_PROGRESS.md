# AI-First Architecture Refactoring - Progress Report

## Overview

This document tracks the progress of refactoring Cardbey into a modular, AI-first architecture where AI model changes don't require rebuilding features.

## ✅ Completed Steps

### Step 1: Architecture Documentation ✅
- **File**: `ARCHITECTURE.md`
- **Status**: Complete
- **Details**: Documented current structure, identified all apps, flows, and hard-coded AI calls

### Step 2: Shared Types Package ✅
- **Location**: `packages/ai-types/`
- **Status**: Complete
- **Files Created**:
  - `package.json` - Package configuration
  - `tsconfig.json` - TypeScript config
  - `src/index.ts` - Unified AI result types
- **Types Defined**:
  - `AIResult<TPayload>` - Generic AI result envelope
  - `LoyaltyFromCardResult` - Loyalty card analysis result
  - `MenuFromPhotoResult` - Menu extraction result
  - `CreativeIdeasResult` - Creative ideas result
  - `SignageFromMenuResult` - Signage generation result
  - `OrchestratorEntryPoint` - Entry point enum
  - `OrchestratorResult` - Union type for all results

### Step 3: AI Engine Interfaces ✅
- **Location**: `src/ai/engines/`
- **Status**: Complete
- **Files Created**:
  - `types.ts` / `types.js` - Engine interfaces
  - `openaiVisionEngine.ts` / `.js` - OpenAI Vision adapter
  - `openaiTextEngine.ts` / `.js` - OpenAI Text adapter
  - `openaiContentEngine.ts` / `.js` - OpenAI Image generation adapter
  - `openaiVideoEngine.ts` / `.js` - Video engine placeholder
  - `index.ts` / `index.js` - Engine registry
- **Interfaces**:
  - `VisionEngine` - Image analysis abstraction
  - `TextEngine` - Text generation abstraction
  - `ContentEngine` - Image generation abstraction
  - `VideoEngine` - Video generation abstraction (placeholder)

### Step 4: Business Services Layer ✅
- **Location**: `src/orchestrator/services/`
- **Status**: Complete
- **Files Created**:
  - `loyaltyFromCardService.js` - Uses AI engines to process loyalty cards
  - `menuFromPhotoService.js` - Uses AI engines to process menu photos
  - `logger.js` - Logger service
- **Features**:
  - Calls `VisionEngine` for image analysis
  - Calls `TextEngine` for text interpretation
  - Returns standardized AI result format
  - Integrates with existing engine tools

### Step 5: Unified Orchestrator Entry Point ✅
- **Location**: `src/orchestrator/index.js`
- **Status**: Complete
- **Features**:
  - Single entry: `runOrchestrator(entryPoint, input)`
  - Supports: `loyalty_from_card`, `menu_from_photo`
  - Logging and timing
  - Error handling

### Step 6: Flow Updates ✅
- **Files Updated**:
  - `src/orchestrator/flows/loyalty_from_card.ts`
  - `src/orchestrator/flows/menu_from_photo.ts`
- **Features**:
  - Feature flag support (`USE_AI_ENGINES` env var)
  - Falls back to legacy implementation if flag is false
  - Uses new business services when enabled

### Step 7: API Endpoints ✅
- **File**: `src/orchestrator/api/orchestratorRoutes.js`
- **Status**: Complete
- **New Endpoints**:
  - `POST /api/orchestrator/loyalty-from-card` - Uses unified orchestrator
  - `POST /api/orchestrator/menu-from-photo` - Uses unified orchestrator
- **Features**:
  - Validates input
  - Calls `runOrchestrator()`
  - Returns standardized AI results
  - No direct AI calls

## 🚧 Remaining Work

### Step 8: Frontend Orchestrator Client
- **Status**: Pending
- **Location**: Frontend apps (marketing-dashboard, web)
- **Tasks**:
  - Create `src/lib/orchestratorClient.ts` in frontend apps
  - Functions: `analyzeLoyaltyCard()`, `analyzeMenuFromPhoto()`, `fetchCreativeIdeas()`
  - Use shared types from `@cardbey/ai-types`
  - Update components to use new client

### Step 9: Device Player Refactoring
- **Status**: Pending
- **Location**: `src/routes/player.js`, `src/routes/device.js`
- **Tasks**:
  - Create `src/agent/` folder structure:
    - `pairing/` - Device pairing logic
    - `playlistManager/` - Playlist handling
    - `fileCache/` - Media caching
    - `renderer/` - Display rendering
    - `healthMonitor/` - Status reporting
  - Create central Agent object
  - Keep existing behavior, just modularize

### Step 10: Additional Services
- **Status**: Pending
- **Tasks**:
  - `SignageBuilderService` - For shopfront_signage entry point
  - `IdeasService` - For creative_ideas entry point
  - `DeviceService` - Device management service

### Step 11: Additional AI Engines
- **Status**: Pending
- **Tasks**:
  - SAM-3 Vision adapter (when SAM-3 client available)
  - Gemini Vision adapter
  - Claude Text adapter
  - Azure OCR adapter

### Step 12: Testing & Logging
- **Status**: Pending
- **Tasks**:
  - Add unit tests for AI engines
  - Add integration tests for services
  - Add logging around orchestrator calls
  - Add performance monitoring

### Step 13: Gradual Migration
- **Status**: In Progress
- **Current**: Feature flag `USE_AI_ENGINES` controls new vs old paths
- **Tasks**:
  - Test new paths in production
  - Gradually enable for all users
  - Remove legacy code paths after validation

## 📊 Migration Status

### Entry Points

| Entry Point | Status | New Service | Legacy Support |
|------------|--------|-------------|----------------|
| `loyalty_from_card` | ✅ Complete | `loyaltyFromCardService.js` | ✅ Yes (via feature flag) |
| `menu_from_photo` | ✅ Complete | `menuFromPhotoService.js` | ✅ Yes (via feature flag) |
| `shopfront_signage` | 🚧 Pending | Not yet created | ✅ Yes (existing handler) |
| `creative_ideas` | 🚧 Pending | Not yet created | ✅ Yes (existing handler) |

### AI Engines

| Engine | Interface | OpenAI Adapter | Other Adapters |
|--------|-----------|----------------|----------------|
| Vision | ✅ Complete | ✅ Complete | 🚧 SAM-3, Gemini (pending) |
| Text | ✅ Complete | ✅ Complete | 🚧 Claude, Gemini (pending) |
| Content | ✅ Complete | ✅ Complete | 🚧 Midjourney (pending) |
| Video | ✅ Complete | 🚧 Placeholder | 🚧 None yet |

## 🔧 Feature Flags

### Current Flags

- `USE_AI_ENGINES` - Controls whether flows use new AI engine services
  - Default: `true` (uses new services)
  - Set to `false` to use legacy implementations

### Usage

```bash
# Use new AI engine services (default)
USE_AI_ENGINES=true npm run dev

# Use legacy implementations
USE_AI_ENGINES=false npm run dev
```

## 📝 Notes

1. **Backward Compatibility**: All changes maintain backward compatibility. Legacy code paths remain functional.

2. **Gradual Migration**: Feature flags allow gradual rollout. Test new paths, then enable globally.

3. **Type Safety**: Shared types package ensures frontend and backend stay in sync.

4. **Extensibility**: Easy to add new AI providers by implementing engine interfaces.

5. **No Breaking Changes**: Existing API endpoints continue to work. New endpoints added alongside.

## 🎯 Next Immediate Steps

1. **Test New Endpoints**: Test `/api/orchestrator/loyalty-from-card` and `/api/orchestrator/menu-from-photo`
2. **Frontend Integration**: Create orchestrator client in frontend apps
3. **Device Player**: Start modularizing device player code
4. **Additional Services**: Create signage and ideas services

## 📚 Key Files Reference

- **Architecture**: `ARCHITECTURE.md`
- **Shared Types**: `packages/ai-types/src/index.ts`
- **AI Engines**: `src/ai/engines/`
- **Business Services**: `src/orchestrator/services/`
- **Unified Orchestrator**: `src/orchestrator/index.js`
- **API Routes**: `src/orchestrator/api/orchestratorRoutes.js`


