# Cardbey Architecture Documentation

> **North star:** [The Cardbey Philosophy](../../../../docs/CARDBEY_PHILOSOPHY.md) — Independence, Opportunity, Capability.
> Major features should state which principle(s) they advance.

## Overview

Cardbey is infrastructure for people to create value (Independence), exchange it (Opportunity), and multiply reusable knowledge (Capability)—delivered today as a modular, AI-first platform spanning stores, websites, loyalty, menus, signage, devices, and assistants. This document describes the current architecture and the target modular architecture.

## Current Structure

### Applications

1. **Backend API (Cardbey Core)**
   - **Location**: `apps/core/cardbey-core`
   - **Port**: 3001
   - **Tech**: Node.js, Express, Prisma, TypeScript/JavaScript
   - **Main Entry**: `src/server.js`

2. **Marketing Dashboard / Performer**
   - **Location**: `../cardbey-marketing-dashboard` (sibling directory)
   - **Port**: 5174 (dev), served from core in production
   - **Tech**: React, Vite

3. **Cardbey Web (Public Website)**
   - **Location**: `../Cardbey-web-latest` (sibling directory)
   - **Port**: 3000 (dev), served from core in production
   - **Tech**: React, Vite

4. **TV/Tablet Player (C-Net Player)**
   - **Location**: Embedded in backend (`src/routes/player.js`, `src/routes/device.js`)
   - **Tech**: HTML/JavaScript (simple player), served at `/player` and `/device/player`

### Current Backend Structure

```
apps/core/cardbey-core/
├── src/
│   ├── server.js              # Main Express server
│   ├── routes/                # HTTP API routes
│   │   ├── loyaltyRoutes.js
│   │   ├── menuRoutes.js
│   │   ├── promoEngine.js
│   │   ├── signageEngine.js
│   │   ├── deviceEngine.js
│   │   └── orchestratorRoutes.js
│   ├── engines/               # Business logic engines
│   │   ├── loyalty/
│   │   ├── menu/
│   │   ├── promo/
│   │   ├── signage/
│   │   └── device/
│   ├── orchestrator/          # AI orchestration layer
│   │   ├── flows/             # High-level flows
│   │   │   ├── loyalty_from_card.ts
│   │   │   ├── menu_from_photo.ts
│   │   │   ├── promo_from_idea.ts
│   │   │   └── signage_from_menu.ts
│   │   ├── api/               # Orchestrator HTTP endpoints
│   │   ├── runtime/           # Tool execution
│   │   └── services/           # Vision, logging services
│   ├── modules/               # Shared modules
│   │   ├── vision/            # Vision/OCR modules
│   │   │   ├── universalVisionInput.ts
│   │   │   ├── sam3Adapter.ts
│   │   │   └── runOcr.js
│   │   └── menu/              # Menu-specific modules
│   │       ├── llmMenuParser.ts
│   │       └── performMenuOcr.js
│   ├── services/              # Service layer
│   │   └── aiService.js       # OpenAI integration (scattered)
│   └── pair/                  # Device pairing
└── prisma/
    └── schema.prisma          # Database schema
```

## Current Feature Flows

### 1. Loyalty from Card

**Current Flow:**
1. Frontend: User uploads loyalty card image → `POST /api/loyalty/from-card` (if exists)
2. Backend: Route handler in `src/routes/loyaltyRoutes.js` or `src/orchestrator/flows/loyalty_from_card.ts`
3. Vision: Calls `src/orchestrator/services/vision.ts` or `src/modules/vision/universalVisionInput.ts`
4. OCR: Uses OpenAI Vision API (hard-coded in `src/modules/vision/runOcr.js`)
5. Processing: Extracts stamps, reward info, generates program
6. Storage: Creates `LoyaltyProgram` via `src/engines/loyalty/configureProgram.js`

**AI Calls:**
- Direct OpenAI Vision API calls in `src/modules/vision/runOcr.js`
- Potential LLM calls in orchestrator flows

### 2. Menu from Photo

**Current Flow:**
1. Frontend: User uploads menu photo → `POST /api/menu/extract`
2. Backend: Route in `src/routes/menuRoutes.js`
3. Extraction: Calls `src/engines/menu/extractMenu.js`
4. Vision: Uses `src/modules/vision/universalVisionInput.ts` → `analyseVisionInput()`
5. OCR: Calls `src/modules/menu/performMenuOcr.js` → `src/modules/vision/runOcr.js` (OpenAI Vision)
6. LLM Parsing: Calls `src/modules/menu/llmMenuParser.ts` → `parseMenuWithLLM()` (OpenAI GPT-4o-mini)
7. Storage: Saves via `src/engines/menu/configureMenu.js`

**AI Calls:**
- OpenAI Vision API in `src/modules/vision/runOcr.js`
- OpenAI Chat Completions in `src/modules/menu/llmMenuParser.js`

### 3. Shopfront Signage

**Current Flow:**
1. Frontend: User requests signage → `POST /api/orchestrator/run` with `entryPoint: "shopfront_signage"`
2. Backend: `src/orchestrator/api/orchestratorController.js` → `handleShopfrontSignage()`
3. Processing: Calls menu engine, signage engine, device engine
4. Generation: Creates playlists, schedules, pushes to devices

**AI Calls:**
- Potentially in signage generation (needs verification)

### 4. Creative Ideas Panel

**Current Flow:**
1. Frontend: User opens ideas panel → `GET /api/ai/suggestions` or similar
2. Backend: Route in `src/routes/ai.js` or `src/ai/suggestions/`
3. Processing: Uses context to generate creative suggestions

**AI Calls:**
- OpenAI calls in `src/services/aiService.js` or `src/ai/suggestions/`

### 5. Device Player (C-Net)

**Current Flow:**
1. Device: Opens `/player` or `/device/player`
2. Backend: Serves HTML player from `src/routes/player.js` or `src/routes/device.js`
3. Player: Polls `/api/screens/:id` and `/api/playlists/:id`
4. Playback: Renders images/videos from playlist
5. Heartbeat: POSTs to `/api/screens/:id/heartbeat` or `/api/device/heartbeat`

**Structure:**
- Simple HTML/JS embedded in backend routes
- No modular structure yet

## Hard-Coded AI Provider Calls

### Current Locations:

1. **OpenAI Vision API**
   - `src/modules/vision/runOcr.js` - Direct `openai.chat.completions.create()` with `gpt-4o`
   - `src/modules/vision/runOcr.ts` - Same

2. **OpenAI Chat Completions**
   - `src/modules/menu/llmMenuParser.js` - Direct `openai.chat.completions.create()` with `gpt-4o-mini`
   - `src/services/aiService.js` - Multiple OpenAI calls for text/image generation
   - `src/routes/assistant.js` - Direct OpenAI calls for chat

3. **OpenAI Image Generation**
   - `src/services/aiService.js` - `openai.images.generate()` with DALL-E

## Target Architecture

### Layer 1: Frontends
- Dashboard/Performer UI (React SPA)
- Content Studio (if separate)
- Device Player UI (TV/Tablet)

### Layer 2: Public API Layer
- REST/HTTP endpoints
- WebSocket/SSE for real-time
- **Zero direct AI calls** - all delegate to Orchestrator

### Layer 3: Orchestrator Layer
- Single entry: `orchestrator.run(entryPoint, inputs)`
- Entry points:
  - `loyalty_from_card`
  - `menu_from_photo`
  - `shopfront_signage`
  - `creative_ideas`
- Delegates to **agents/services**, NOT specific AI models

### Layer 4: AI Abstraction Layer (Engines)
- `VisionEngine` - OpenAI Vision, SAM-3, Gemini Vision, Azure OCR
- `TextEngine` - GPT-4.x, Claude, Gemini, Llama
- `ContentEngine` - Image generation (DALL-E, Midjourney, etc.)
- `VideoEngine` - Video generation
- Each engine exposes stable interface, multiple adapters

### Layer 5: Business Services Layer
- `LoyaltyFromCardService`
- `MenuFromPhotoService`
- `SignageBuilderService`
- `IdeasService`
- `DeviceService`
- These call engines via AI abstraction interfaces

### Layer 6: Device Agent (Player)
- Modular structure:
  - `pairing/` - Device pairing
  - `playlistManager/` - Playlist handling
  - `fileCache/` - Media caching
  - `renderer/` - Display rendering
  - `healthMonitor/` - Status reporting
  - `localAI/` - Future local AI

### Layer 7: Shared Types & Schema
- Unified TypeScript types for AI outputs
- Shared across backend and frontend
- Versioned AI result envelopes

## Migration Status

### ✅ Already Modular
- Engine structure (`src/engines/`) - Good separation
- Orchestrator flows (`src/orchestrator/flows/`) - High-level flows exist
- Universal Vision Input (`src/modules/vision/universalVisionInput.ts`) - Good abstraction

### ❌ Needs Refactoring
- Direct OpenAI calls scattered across modules
- No unified AI engine interfaces
- No shared types package
- Device player not modular
- API endpoints may call AI directly

## Refactoring Progress

### ✅ Completed

1. **ARCHITECTURE.md** - Documented current structure and target architecture
2. **Shared Types Package** - Created `packages/ai-types` with unified AI result types
3. **AI Engine Interfaces** - Created `src/ai/engines/` with:
   - `VisionEngine` interface
   - `TextEngine` interface
   - `ContentEngine` interface
   - `VideoEngine` interface
4. **OpenAI Adapters** - Implemented OpenAI adapters for all engines
5. **Engine Registry** - Created registry with getter functions
6. **Business Services** - Created:
   - `loyaltyFromCardService.js` - Uses AI engines to process loyalty cards
   - `menuFromPhotoService.js` - Uses AI engines to process menu photos
7. **Unified Orchestrator** - Created `src/orchestrator/index.js` with `runOrchestrator()` entry point
8. **Flow Updates** - Updated `loyalty_from_card.ts` and `menu_from_photo.ts` to use new services with feature flag

### 🚧 In Progress

1. **API Endpoints** - Need to update routes to use unified orchestrator
2. **Feature Flags** - Add environment variable toggles for gradual migration

### 📋 TODO

1. Update API endpoints (`/api/loyalty/from-card`, `/api/menu/extract`) to use `runOrchestrator()`
2. Create frontend orchestrator client
3. Refactor device player into modular agent structure
4. Add SAM-3 / Gemini Vision engines
5. Add additional services (signage builder, creative ideas)
6. Improve tests
7. Gradually deprecate legacy direct AI calls

## Next Steps

1. Update API endpoints to call `runOrchestrator()` instead of direct flows
2. Add feature flags for gradual rollout
3. Create frontend client library
4. Refactor device player

