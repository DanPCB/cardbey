## Prompt → Workflow → C-Net (mockable)

The Core API can now translate natural language promotions into stored workflows and mock C-Net playlist publishes.

### Quickstart

1. Run migrations:

```bash
npm install
npm run db:migrate
```

2. Start the API:

```bash
npm run dev:api
```

3. Create a workflow from a prompt:

```bash
curl -s -X POST http://localhost:3001/api/workflows/from-prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Tạo khuyến mãi cho bánh mì phô mai giảm 20% trong 2 phút, hiển thị trên Bakery#1"}'
```

Response contains the stored `workflow` and a `previewPlaylist` built from deterministic helpers.

4. Execute the workflow:

```bash
curl -s -X POST http://localhost:3001/api/workflows/<workflowId>/execute
```

If `CNET_BASE_URL` is not set, the mock adapter writes the playlist payload to `/tmp/cnet-out/<playlistId>.json` and logs the publish event. The C-Net player should consume this JSON schema:

```json
{
  "playlistId": "Bakery#1",
  "items": [
    {
      "type": "image",
      "src": "/static/posters/placeholder.png",
      "durationMs": 120000,
      "caption": "bánh mì phô mai — hôm nay giảm 20%!"
    }
  ]
}
```

### Environment variables

| Name | Description |
| ---- | ----------- |
| `CNET_BASE_URL` | Optional HTTP endpoint for real publishes. |
| `CNET_API_KEY` | Optional bearer token when using a real endpoint. |
| `CNET_OUT_DIR` | Directory for mock playlist payloads (defaults to `/tmp/cnet-out`). |

# Cardbey Core API

**Version:** 1.0.0  
**Port:** 3001  
**Technology:** Node.js + Express + Prisma + PostgreSQL

---

## 🎯 Purpose

Central backend API for all Cardbey services. Handles:
- JWT Authentication
- User & Business Management
- Demand Tracking
- Feature Flags

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your DATABASE_URL

# Generate Prisma client
npx prisma generate

# Run database migration
npx prisma migrate dev --name init

# Start development server
cd cardbey-core
npm run dev        # start Core

# In another terminal (optional - for health monitoring)
npm run dev:health
```

### SAM-3 Setup (Optional)

For image segmentation features, see **[SAM-3 Setup Instructions](docs/SAM3_SETUP.md)**:
- Request Hugging Face access
- Download SAM-3 model
- Configure environment variables
- Test inference locally

**Server will start on:** http://localhost:3001

### Quick OAuth Setup

To enable OAuth in System Health:

1. Copy `.env.example` to `.env` (if not already done)
2. Fill in at least one OAuth provider's credentials, OR
3. For local dev only, set `OAUTH_DEV_FAKE=1` in `.env`

After setting one provider (or `OAUTH_DEV_FAKE=1` in dev), System Health shows `OAuth: ok`.

---

## 📋 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login, get JWT
- `GET  /api/auth/me` - Get current user (requires auth)

### Demands
- `POST /api/demands` - Track user intent (requires auth)
- `GET  /api/demands` - Get user's demands (requires auth)
- `PATCH /api/demands/:id/fulfill` - Mark as fulfilled (requires auth)

### System
- `GET /health` - Simple health check (public, legacy)
- `GET /api/health` - Comprehensive health status (public)
- `GET /healthz` - Health check: 200 if API and DB are ok, else 503
- `GET /readyz` - Readiness check: 200 if all sections are ok, else 503
- `GET /api/oauth/providers` - OAuth provider status with missing env vars (public)
- `GET /api/v2/flags` - Feature flags (public)
- `GET /api/v2/home/sections` - Homepage sections (public)

#### Health Endpoint Response

`GET /api/health` returns comprehensive system status:

```json
{
  "version": "1.0.0",
  "uptimeSec": 1234,
  "api": { "ok": true },
  "database": { "ok": true, "dialect": "sqlite", "latencyMs": 12 },
  "scheduler": { "ok": true, "lastHeartbeat": "2025-11-13T11:20:00Z" },
  "sse": { "ok": true, "path": "/api/stream" },
  "oauth": {
    "ok": true,
    "providers": ["facebook", "twitter"],
    "details": [
      { "name": "facebook", "ok": true, "missing": [] },
      { "name": "tiktok", "ok": false, "missing": ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"] },
      { "name": "twitter", "ok": true, "missing": [] }
    ]
  }
}
```

#### OAuth Providers Endpoint

`GET /api/oauth/providers` returns detailed status for each OAuth provider:

```json
{
  "providers": [
    {
      "name": "facebook",
      "ok": true,
      "missing": []
    },
    {
      "name": "tiktok",
      "ok": false,
      "missing": ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REDIRECT_URI"]
    },
    {
      "name": "twitter",
      "ok": false,
      "missing": ["TWITTER_CLIENT_ID"]
    }
  ]
}
```

If `OAUTH_DEV_FAKE=1` is set (and `NODE_ENV !== 'production'`), a fake "dev" provider will be included:

```json
{
  "providers": [
    { "name": "dev", "ok": true, "missing": [] },
    ...
  ]
}
```

---

## 🔐 Authentication

All API requests to protected endpoints require JWT:

```bash
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 📊 Database Schema

See `prisma/schema.prisma` for complete schema.

**Models:**
- User - Authentication and profile
- Business - Store/business entity
- Demand - User intent tracking

---

## 🧪 Testing

### Running Tests Locally

```bash
# Run all tests
npm test

# This automatically runs:
# 1. pretest: Sets up test database schema (prisma db push)
# 2. test: Runs Vitest test suite
```

**Environment Variables:**
- `NODE_ENV=test` - Automatically set by test script
- `DATABASE_URL=file:./prisma/test.db` - Uses isolated test database
- `DEBUG_TESTS=1` - Optional: enables verbose test logging

**Test Database:**
- Tests use a separate SQLite database (`prisma/test.db`) to avoid polluting development data
- The `pretest` script ensures the schema is up-to-date before running tests
- All test data is isolated and cleaned up between runs

### Continuous Integration (CI)

Tests run automatically on:
- **Push** to `main`, `develop`, `rollback/**`, or `feature/**` branches
- **Pull Requests** targeting `main` or `develop`
- **Manual trigger** via GitHub Actions workflow dispatch

**CI Configuration:**
- Workflow: `.github/workflows/tests.yml`
- Runs on: Ubuntu latest, Node.js 20
- Test command: `npm test` (executed from `apps/core/cardbey-core` directory)

**View CI Results:**
- GitHub Actions: https://github.com/DanPCB/cardbey-core/actions
- Workflow name: "Tests"

### API Testing (Manual)

```bash
# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}'

# Get user
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🔍 Dev Checks

### Health Monitoring

Monitor health status in real-time while developing:

```bash
# Start server and health monitor together
npm run dev:health
```

This runs the server and polls `/api/health` every 5 seconds, displaying component status.

**Alternative:** Start server and health monitor separately:

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Start health monitor
node scripts/poll-health.js
```

### Database Connection Test

Quick test to verify database connectivity:

```bash
npm run db:ping
```

Exits with code 0 on success, non-zero on failure.

### Environment Validation

Validate required environment variables:

```bash
npm run check:env
```

Checks for `DATABASE_URL` and optional OAuth provider configuration. Provides actionable error messages.

### Setting Core URL for Dashboard

To set the Core API URL in the marketing dashboard without reloading:

```javascript
// In browser console
localStorage.setItem('__APP_API_BASE__', 'http://127.0.0.1:3001');
window.__APP_API_BASE__ = 'http://127.0.0.1:3001';
```

### Quick Health Check Scripts

Quick health check script to verify API endpoints are working:

### Linux/macOS:
```bash
chmod +x scripts/check-api.sh
./scripts/check-api.sh
```

### Windows (PowerShell):
```powershell
.\scripts\check-api.ps1
```

### Custom API URL:
```bash
# Linux/macOS
CARDBEY_API_URL=http://192.168.1.11:3001 ./scripts/check-api.sh

# Windows PowerShell
$env:CARDBEY_API_URL='http://192.168.1.11:3001'; .\scripts\check-api.ps1
```

The script tests:
- ✅ `/api/health` - System health status
- ✅ `/api/dashboard/trend` - Dashboard trend data  
- ✅ `/api/stream?key=admin` - SSE endpoint headers

---

## 🔧 Troubleshooting

---

## 📁 Structure

```
cardbey-core/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── server.js              # Express server
│   ├── middleware/
│   │   ├── auth.js            # JWT middleware
│   │   └── errorHandler.js    # Error handling
│   └── routes/
│       ├── auth.js            # Auth endpoints
│       └── demands.js         # Demand tracking
├── package.json
├── .env.example
└── README.md                  # This file
```

---

## 🔧 Configuration

### Environment Variables

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/cardbey
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d
PORT=3001
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5174

# SAM-3 Configuration (optional - see docs/SAM3_SETUP.md)
SAM3_MODEL_PATH=./models/sam3_hiera_large.pt
SAM3_DEVICE=cuda  # or 'cpu' for development machines

# OAuth Providers (optional)
FACEBOOK_CLIENT_ID=your_facebook_client_id
FACEBOOK_CLIENT_SECRET=your_facebook_client_secret
FACEBOOK_REDIRECT_URI=http://localhost:3001/oauth/facebook/callback

TIKTOK_CLIENT_KEY=your_tiktok_client_key
TIKTOK_CLIENT_SECRET=your_tiktok_client_secret
TIKTOK_REDIRECT_URI=http://localhost:3001/oauth/tiktok/callback

TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret
TWITTER_REDIRECT_URI=http://localhost:3001/oauth/twitter/callback

# Development: Fake OAuth (local dev only, never in production)
OAUTH_DEV_FAKE=1  # Enables a fake "dev" provider for local testing
```

**Note:** `OAUTH_DEV_FAKE=1` is automatically disabled in production (`NODE_ENV=production`). Use it only for local development to test OAuth flows without real credentials.

### Screen Status Worker Configuration

The worker pings `http://<device-ip>:<port><path>` to check if screens are online.

**For FireTV APK**, if the player exposes `/hello` on port 3001, set:
```bash
SCREENS_PING_PATH=/hello
SCREENS_DEFAULT_PORT=3001
```

**For web players** (default):
```bash
SCREENS_PING_PATH=/health
SCREENS_DEFAULT_PORT=5174
```

**Development self-ping** (local testing without devices):
```bash
SCREENS_SELF_PING=1  # Pings Core's /healthz instead of devices
```

**Important:** Ensure Windows Firewall allows:
- Inbound connections to the ping port on the device
- Outbound connections from the Core host to device IPs

The worker automatically:
- Limits concurrency (max 10 simultaneous pings)
- Backs off failed screens (once per minute after 5+ failures)
- Logs errors only on first failure and every Nth failure (configurable)
- Marks screens offline with error type (refused, dns, timeout, network)

---

## 📚 Documentation

- **API Docs:** See `CARDBEY-RESTRUCTURE-COMPLETE.md`
- **Integration Guide:** See parent directory documentation

---

**Status:** ✅ Ready for development

