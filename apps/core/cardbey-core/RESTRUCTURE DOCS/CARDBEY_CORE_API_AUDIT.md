# Cardbey Core API Audit

**Date:** 2025-01-25  
**Purpose:** Comprehensive audit of cardbey-core API domains and endpoints to identify gaps between cardbey-web-latest (A) and Marketing Dashboard + Core (B+C)

---

## C. cardbey-core – API Domains

### Domain: Authentication & Users

**Example endpoints:**
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login (email/username + password)
- `GET /api/auth/me` - Get current user (requires auth)
- `POST /api/auth/dev/seed-admin` - Dev-only: Seed admin user

**Used by A (cardbey-web-latest):** ❓ **Unknown** (likely yes - standard auth flow)

**Used by B (Marketing Dashboard):** ✅ **Yes** (based on recent fixes for auth tokens)

**Notes:**
- JWT-based authentication with `requireAuth` middleware
- Supports email or username login
- User model includes `roles`, `onboarding`, `hasBusiness` fields
- OAuth routes exist separately (`/api/oauth/*`)

---

### Domain: OAuth & Social Login

**Example endpoints:**
- `GET /api/oauth/status` - OAuth provider status
- `GET /api/oauth/providers` - List available OAuth providers
- `GET /oauth/facebook/start` - Initiate Facebook OAuth
- `GET /oauth/facebook/callback` - Facebook OAuth callback
- `GET /oauth/tiktok/start` - Initiate TikTok OAuth
- `GET /oauth/tiktok/callback` - TikTok OAuth callback

**Used by A:** ❓ **Unknown** (likely yes if social login was implemented)

**Used by B:** ❌ **No** (not mentioned in recent work)

**Notes:**
- Facebook and TikTok OAuth flows implemented
- Status endpoint for checking OAuth configuration

---

### Domain: Screens/Devices Management

**Example endpoints:**
- `GET /api/screens` - List screens (with pagination, search, stats)
- `GET /api/screens/:id` - Get screen details
- `GET /api/screens/:id/playlist` - Get screen's assigned playlist (summary)
- `GET /api/screens/:id/playlist/full` - Get full playlist with media URLs
- `PUT /api/screens/:id/playlist` - Assign playlist to screen
- `POST /api/screens/:id/heartbeat` - Device heartbeat (status updates)
- `DELETE /api/screens/:id` - Delete screen (soft delete)
- `GET /api/screens/pending` - List pending (unpaired) screens
- `POST /api/screens/hello` - Device registration/hello
- `POST /api/devices/hello` - Alias for device registration

**Used by A:** ✅ **Likely Yes** (core functionality for digital signage)

**Used by B:** ✅ **Yes** (extensively used - pairing, playlist assignment, status monitoring)

**Notes:**
- Comprehensive screen management with pairing flow
- Real-time status tracking via heartbeat
- Playlist assignment and retrieval
- Soft delete support (`deletedAt` field)

---

### Domain: Screen Pairing

**Example endpoints:**
- `POST /api/screens/pair/initiate` - Start pairing session (generate code)
- `GET /api/screens/pair/peek/:code` - Check pairing code status
- `GET /api/screens/pair/sessions/:sessionId/status` - Get pairing session status
- `POST /api/screens/pair/start` - Start pairing (legacy)
- `GET /api/screens/pair/active` - List active pairing sessions
- `POST /api/screens/pair/register` - Register device with pairing code
- `POST /api/screens/pair/complete` - Complete pairing (bind screen to user)
- `POST /api/screens/:screenId/repair/complete` - Repair/re-pair a screen
- `GET /api/pair/sessions/:sessionId/status` - Legacy pairing status
- `GET /api/pair/codes/:code/status` - Legacy code status

**Used by A:** ❓ **Unknown** (may have different pairing flow)

**Used by B:** ✅ **Yes** (recently fixed - pairing flow is core feature)

**Notes:**
- Database-backed session store for pairing
- Code-based pairing with expiration
- Support for repair/re-pairing
- Legacy routes kept for backward compatibility

---

### Domain: Playlists

**Example endpoints:**
- `GET /api/playlists` - List playlists (with pagination, search, item counts)
- `GET /api/playlists/:id` - Get playlist details with items
- `POST /api/playlists` - Create playlist
- `PATCH /api/playlists/:id` - Update playlist (name, items)
- `DELETE /api/playlists/:id` - Delete playlist

**Used by A:** ✅ **Likely Yes** (core content management)

**Used by B:** ✅ **Yes** (extensively used - playlist creation, assignment, validation fixes)

**Notes:**
- Playlist items reference `Media` records (not `Content`)
- Validation for `mediaId` required in items
- Item ordering, duration, fit, muted, loop settings
- Playable item counting and missing file detection

---

### Domain: Media/Content Upload

**Example endpoints:**
- `POST /api/upload/playlist-media` - Upload media file (multipart/form-data)
- `POST /api/uploads/create` - Upload media (alias, supports JSON base64)
- `POST /api/uploads/playlist-media` - Legacy upload endpoint

**Used by A:** ✅ **Likely Yes** (media upload is essential)

**Used by B:** ✅ **Yes** (recently fixed - base64 JSON upload support added)

**Notes:**
- Supports both multipart/form-data and JSON (base64) uploads
- Creates `Media` records in database
- S3 upload with local storage fallback
- Video optimization queue integration
- Metadata extraction (dimensions, duration)

---

### Domain: Content Studio (Designs)

**Example endpoints:**
- `GET /api/contents` - List Content Studio designs
- `GET /api/contents/:id` - Load design (with elements, settings, thumbnail)
- `POST /api/contents` - Save design
- `PUT /api/contents/:id` - Update design
- `DELETE /api/contents/:id` - Delete design

**Used by A:** ❓ **Unknown** (may not have Content Studio)

**Used by B:** ✅ **Yes** (recently fixed - preview, loading, saving all working)

**Notes:**
- Stores canvas designs with `elements`, `settings`, `renderSlide`
- `thumbnailUrl` for library previews
- Optimistic locking via `version` field
- Default name generation if missing

---

### Domain: AI Design Assistant

**Example endpoints:**
- `POST /api/ai/create` - Generate design from prompt
- `POST /api/ai/layout` - Generate layout suggestions
- `POST /api/ai/caption` - Generate captions/text
- `POST /api/ai/palette` - Generate color palette
- `POST /api/ai/plan-design` - Plan design workflow
- `POST /api/ai/generate-design` - Full design generation
- `POST /api/ai/text` - Generate text content
- `POST /api/ai/image` - Generate images
- `POST /api/ai/images/background` - Generate background images
- `POST /api/studio/suggestions` - Get design suggestions

**Used by A:** ❓ **Unknown** (may have different AI integration)

**Used by B:** ✅ **Yes** (AI Mode toggle, design generation features)

**Notes:**
- Trend profile integration for context-aware generation
- Multiple AI services (text, image, layout, palette)
- Background image generation
- Design planning and orchestration

---

### Domain: AI Orchestration (Advanced)

**Example endpoints:**
- `GET /api/ai/stream` - SSE stream for AI operations
- `GET /api/ai/metrics` - AI orchestration metrics
- `POST /api/ai/suggestions` - Get AI suggestions
- `POST /api/ai/events` - AI event intake

**Used by A:** ❌ **Likely No** (advanced orchestration features)

**Used by B:** ✅ **Yes** (SSE streaming, metrics, suggestions)

**Notes:**
- Server-Sent Events for real-time AI updates
- Metrics and analytics for AI operations
- Event-driven architecture

---

### Domain: Trends & Profiles

**Example endpoints:**
- `GET /api/trends` - List trend profiles
- `GET /api/trends/:idOrSlug` - Get trend profile by ID or slug

**Used by A:** ❓ **Unknown**

**Used by B:** ✅ **Yes** (used by AI Design Assistant for context)

**Notes:**
- Trend profiles for AI context (season, goal, data)
- Active/inactive status
- Slug-based lookup

---

### Domain: Journeys (Multi-step Playbooks)

**Example endpoints:**
- `GET /api/journeys/templates` - List journey templates
- `GET /api/journeys/templates/:slug` - Get template details
- `POST /api/journeys/start` - Start a journey instance
- `GET /api/journeys/instances` - List user's journey instances
- `GET /api/journeys/instances/:id` - Get journey instance details
- `PATCH /api/journeys/instances/:id` - Update journey instance
- `POST /api/journeys/instances/:instanceId/steps/:stepId/action` - Execute step action
- `GET /api/journeys/planner` - Get planner tasks
- `GET /api/journeys/suggestions` - Get journey suggestions
- `GET /api/journeys/analytics/funnel/:templateId` - Journey funnel analytics
- `GET /api/journeys/analytics/metrics` - System metrics

**Used by A:** ❓ **Unknown** (may be new feature)

**Used by B:** ✅ **Yes** (journey system for onboarding/guidance)

**Notes:**
- Multi-step playbooks for user guidance
- Templates with steps (INFO, FORM, ACTION, REVIEW)
- Instance tracking with status
- Planner tasks for scheduled actions
- Analytics and funnel tracking

---

### Domain: Assistant Chatbot

**Example endpoints:**
- `POST /api/assistant/guest` - Create guest session
- `POST /api/assistant/chat` - Chat with assistant
- `POST /api/assistant/action` - Execute assistant action
- `GET /api/assistant/summary` - Get conversation summary

**Used by A:** ❓ **Unknown** (may have different chatbot)

**Used by B:** ✅ **Yes** (assistant chatbot for user guidance)

**Notes:**
- Guest and authenticated user support
- Action execution (create store, design flyer, etc.)
- Conversation summaries

---

### Domain: Workflows & Campaigns

**Example endpoints:**
- `POST /api/workflows/from-prompt` - Create workflow from natural language prompt
- `GET /api/campaigns/:id` - Get campaign details

**Used by A:** ❓ **Unknown**

**Used by B:** ❓ **Unknown** (may be used internally, assistant mentions campaigns)

**Notes:**
- Prompt parsing for workflow creation
- CNet integration for publishing
- Poster generation
- Campaign model exists but limited endpoints (only GET by ID)
- Campaign creation happens via workflow creation
- No full CRUD for campaigns (no list, update, delete endpoints)

---

### Domain: Demands (User Intent Tracking)

**Example endpoints:**
- `POST /api/demands` - Track user intent/demand
- `GET /api/demands` - List user's demands
- `PATCH /api/demands/:id/fulfill` - Mark demand as fulfilled

**Used by A:** ❓ **Unknown** (may be analytics feature)

**Used by B:** ❓ **Unknown** (may be used for analytics)

**Notes:**
- User intent tracking (scope, category, intent)
- Context storage (JSON)
- Fulfillment tracking

---

### Domain: Assets Library

**Example endpoints:**
- `GET /api/assets/search` - Search asset library

**Used by A:** ❓ **Unknown**

**Used by B:** ✅ **Likely Yes** (asset library for design elements)

**Notes:**
- Asset search functionality
- Static asset serving at `/assets/*`

---

### Domain: Home/Dashboard

**Example endpoints:**
- `GET /api/v2/home/sections` - Get home page sections
- `GET /api/v2/flags` - Get feature flags

**Used by A:** ❓ **Unknown** (may have different home structure)

**Used by B:** ✅ **Likely Yes** (dashboard home page)

**Notes:**
- Home sections for dashboard
- Feature flags for gradual rollout

---

### Domain: Player Configuration

**Example endpoints:**
- `GET /api/player/config` - Get player configuration

**Used by A:** ❓ **Unknown**

**Used by B:** ✅ **Yes** (player settings for screens)

**Notes:**
- Player settings (orientation, behavior, etc.)

---

### Domain: Real-time/SSE

**Example endpoints:**
- `GET /api/stream` - SSE stream for real-time events
- `GET /api/stream/preview` - Preview SSE stream

**Used by A:** ❓ **Unknown** (may use WebSockets)

**Used by B:** ✅ **Yes** (extensively used - screen status, pairing events)

**Notes:**
- Server-Sent Events for real-time updates
- Screen status broadcasts
- Pairing event broadcasts
- WebSocket support also available

---

### Domain: Health & Diagnostics

**Example endpoints:**
- `GET /health` - Simple health check
- `GET /healthz` - Health check (API + DB)
- `GET /readyz` - Readiness check (API + DB + Scheduler + SSE + OAuth)
- `GET /api/ping` - API ping
- `GET /api/health` - Detailed health check
- `GET /api/health/dashboard/trend` - Dashboard trend health
- `GET /api/health/ai/insights` - AI insights health
- `GET /api/health/env` - Environment info
- `GET /api/health/media/health` - Media health check
- `GET /api/debug/pairing-stats` - Debug pairing statistics (dev only)

**Used by A:** ✅ **Likely Yes** (standard health checks)

**Used by B:** ✅ **Yes** (monitoring and diagnostics)

**Notes:**
- Comprehensive health checking
- Readiness probes for orchestration
- Debug endpoints for development

---

### Domain: Admin

**Example endpoints:**
- `POST /api/admin/scan-missing-media` - Scan for missing media files
- `GET /api/admin/media-stats` - Media statistics
- `GET /api/admin/missing-media` - List missing media
- `POST /api/admin/s3-cleanup` - S3 cleanup operations
- `POST /api/admin/media/cleanup/orphans` - Cleanup orphaned media
- `POST /api/admin/media/cleanup/originals` - Cleanup original files
- `GET /api/admin/media/health` - Media health check

**Used by A:** ❓ **Unknown** (may have different admin interface)

**Used by B:** ✅ **Likely Yes** (admin tools for maintenance)

**Notes:**
- Media cleanup and maintenance
- S3 storage management
- Health monitoring

---

### Domain: Internal API (Lambda/Workers)

**Example endpoints:**
- `POST /api/internal/media/optimized` - Lambda callback for optimized videos
- `GET /api/internal/health` - Internal health check

**Used by A:** ❌ **No** (internal only)

**Used by B:** ❌ **No** (internal only)

**Notes:**
- Internal endpoints for Lambda callbacks
- Video optimization queue callbacks
- Secret validation required

---

### Domain: Import/Export

**Example endpoints:**
- `POST /api/import/folder-to-playlist` - Import folder as playlist

**Used by A:** ❓ **Unknown**

**Used by B:** ❓ **Unknown**

**Notes:**
- Bulk import functionality

---

## Summary Statistics

**Total API Domains:** 20+  
**Total Endpoints:** 80+  
**Authentication Required:** Most endpoints (except health, OAuth, pairing initiation)  
**Real-time Features:** SSE streams, WebSocket support  
**File Upload:** Multipart and JSON (base64) support  
**Database:** Prisma ORM with SQLite (PostgreSQL support via env)

---

## Key Observations

### ✅ Well-Implemented Domains (B+C)
1. **Screens/Devices** - Comprehensive management, pairing, status tracking
2. **Playlists** - Full CRUD with validation
3. **Content Studio** - Design saving, loading, preview
4. **AI Design Assistant** - Multiple AI services, orchestration
5. **Real-time** - SSE and WebSocket support
6. **Health/Diagnostics** - Comprehensive monitoring

### ❓ Unknown Usage (Need to Audit A)
1. **OAuth** - May not be used if A has different auth
2. **Journeys** - May be new feature not in A
3. **Workflows** - May be internal only
4. **Demands** - Analytics feature, may not be in A
5. **Assets Library** - May have different implementation

### ⚠️ Potential Gaps (A may have, B+C may not)

1. **Campaigns** - ⚠️ **Limited endpoints (only GET by ID)**
   - `Campaign` model exists in schema (linked to `Workflow`)
   - `GET /api/campaigns/:id` exists (read-only)
   - Campaign creation happens via `POST /api/workflows/:id/execute`
   - No list, update, delete, or create endpoints for campaigns
   - No campaign management UI endpoints

2. **Credits/Billing** - ❌ **No payment or credit system endpoints**
   - No billing, subscription, or credit models in schema
   - No payment processing endpoints

3. **Analytics/Reports** - ⚠️ **Limited analytics**
   - Journey funnel analytics exists
   - System metrics endpoint exists
   - No general analytics/reporting endpoints
   - No screen performance analytics
   - No content performance analytics

4. **User Management** - ⚠️ **Basic CRUD only**
   - Register, login, me endpoints exist
   - No admin user management (list users, update roles, etc.)
   - No user profile update endpoints
   - No password reset endpoints

5. **Business/Store Management** - ⚠️ **Model exists but no CRUD endpoints**
   - `Business` model exists in schema (linked to `User`)
   - No `/api/business` or `/api/stores` routes found
   - No business creation/update endpoints

6. **Notifications** - ❌ **No notification system**
   - No notification models in schema
   - No notification endpoints

7. **Content Templates** - ⚠️ **Limited template support**
   - Journey templates exist
   - No content/design templates
   - No template library endpoints

8. **Scheduling** - ❌ **No scheduling/calendar**
   - No scheduling models in schema
   - No calendar endpoints
   - No time-based playlist assignment

9. **Multi-tenant** - ⚠️ **No explicit tenant isolation**
   - No tenant models in schema
   - No tenant-scoped endpoints
   - May be implicit via user ownership

10. **AI Orchestration Models** - ⚠️ **Models exist but limited endpoints**
    - `EventLog`, `SuggestionLog`, `IdempotencyKey` models exist
    - `PriceChange`, `ReorderRequest`, `CreativeRefreshTask` models exist
    - Limited endpoints for these (mostly internal)

---

## Next Steps

1. **Audit cardbey-web-latest (A)** to identify:
   - Which endpoints are actually used
   - What features exist that aren't in B+C
   - What business logic needs to be ported

2. **Audit Marketing Dashboard (B)** to identify:
   - Which endpoints are actually used
   - What frontend features depend on missing endpoints
   - What UI components need backend support

3. **Create Gap Analysis** comparing A vs B+C to identify:
   - Missing features
   - Missing endpoints
   - Business logic that needs porting
   - Data migration requirements

