# 🚀 Cardbey Core - Quick Start Guide

## Overview

Cardbey Core is now the **single backend** for all Cardbey services. No more port conflicts or duplicate servers!

### Architecture

```
┌─────────────────────────────────────────┐
│   Cardbey Core (Port 3001)             │
│   ├── API Server (server.js)          │
│   └── Worker Process (worker.js)       │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴─────────┐
        │                │
        ▼                ▼
┌───────────────┐  ┌────────────────────┐
│ Cardbey Web   │  │ Marketing Dashboard│
│ Port 3000     │  │ Port 5174         │
│ (Vite proxy)  │  │ (Vite proxy)      │
└───────────────┘  └────────────────────┘
```

---

## 🛠️ Installation

### 1. Install Dependencies

```bash
cd cardbey-core
npm install
```

This will install:
- `cross-env` - Cross-platform environment variables
- `npm-run-all` - Run multiple npm scripts in parallel
- `nodemon` - Auto-restart on file changes

### 2. Setup Database

```bash
npm run setup
```

This will:
- Generate Prisma client
- Run database migrations
- Create `dev.db` SQLite database

### 3. Configure Environment

Copy `.env.example` to `.env` and update as needed:

```env
NODE_ENV=development
PORT=3001
ROLE=api

# CORS (allow both frontends)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5174

# Database
DATABASE_URL=file:./prisma/dev.db

# Optional: OAuth, OpenAI, etc.
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
OPENAI_API_KEY=
```

---

## 🚀 Development

### Start Everything (Recommended)

```bash
npm run dev
```

This starts:
- **API Server** on `http://localhost:3001` (serves HTTP endpoints)
- **Worker Process** (background jobs, no port)

You'll see two processes running side-by-side:

```
[cardbey-api] ✅ Server running on http://localhost:3001
[cardbey-worker] ✅ All background workers initialized
```

### Start API Only

```bash
npm run dev:api
```

### Start Worker Only

```bash
npm run dev:worker
```

---

## 🌐 Frontend Setup

### Cardbey Web (Port 3000)

```bash
cd Cardbey-web-latest
npm install
npm run dev
```

- Opens at `http://localhost:3000`
- All `/api/*` requests proxy to `http://localhost:3001`
- SSE at `/events` → proxies to `/api/stream`

### Marketing Dashboard (Port 5174)

```bash
cd cardbey-marketing-dashboard
npm install
npm run dev
```

- Opens at `http://localhost:5174`
- All `/api/*` requests proxy to `http://localhost:3001`
- SSE, uploads, player all proxy to core

---

## ✅ Verify Setup

### Run Smoke Tests

```bash
cd cardbey-core
npm run smoke:dev
```

This tests:
- ✅ Health check
- ✅ Journey templates
- ✅ Guest assistant
- ✅ AI metrics
- ✅ Feature flags
- ✅ SSE streaming

Expected output:

```
✅ Health Check              (200)
✅ Journey Templates         (200)
✅ Guest Assistant           (200)
✅ AI Metrics                (200)
✅ Feature Flags             (200)
✅ SSE Stream                (streaming)
✅ AI SSE Stream             (streaming)

📊 Results: 7 passed, 0 failed
✅ All smoke tests passed!
```

### Check Running Processes

```bash
# Windows PowerShell
Get-NetTCPConnection -LocalPort 3001

# Expected: Only cardbey-core process
```

---

## 📦 Production Deployment

### 1. Build Frontends

```bash
# Build Cardbey Web
cd Cardbey-web-latest
npm run build  # outputs to build/

# Build Marketing Dashboard
cd cardbey-marketing-dashboard
npm run build  # outputs to dist/
```

### 2. Configure Static Hosting

Edit `cardbey-core/core.config.json`:

```json
{
  "staticDirs": [
    "../Cardbey-web-latest/build",
    "../cardbey-marketing-dashboard/dist"
  ],
  "spaFallback": "../cardbey-marketing-dashboard/dist"
}
```

### 3. Start with PM2

```bash
cd cardbey-core
npm install -g pm2
pm2 start ecosystem.config.js
pm2 logs
pm2 status
```

This starts:
- `cardbey-api` (API server on port 3001)
- `cardbey-worker` (background jobs, no port)

### 4. Access Production

- **Marketing Dashboard:** `http://localhost:3001/`
- **Cardbey Web:** `http://localhost:3001/` (depends on `spaFallback`)
- **API:** `http://localhost:3001/api/*`
- **Health:** `http://localhost:3001/health`

---

## 🔍 Troubleshooting

### Port 3001 Already in Use

```bash
# Windows PowerShell
Get-NetTCPConnection -LocalPort 3001 | 
  Select-Object -ExpandProperty OwningProcess | 
  Get-Unique | 
  ForEach-Object { Stop-Process -Id $_ -Force }
```

### Background Jobs Not Running

Check that worker process is running:

```bash
pm2 status
# Should show both cardbey-api and cardbey-worker
```

### Frontend Can't Connect to API

1. Verify backend is running: `curl http://localhost:3001/health`
2. Check Vite proxy config in `vite.config.ts` / `vite.config.js`
3. Ensure `target: 'http://localhost:3001'` (not 3000 or 5174)

### SSE Not Working

1. Check backend SSE endpoint: `curl -N http://localhost:3001/api/stream`
2. Verify frontend uses `/events` (proxied to `/api/stream`)
3. Check CORS allows your frontend origin

---

## 📚 Key Files

| File | Purpose |
|------|---------|
| `src/server.js` | HTTP API server (Express routes) |
| `src/worker.js` | Background jobs (no port binding) |
| `ecosystem.config.js` | PM2 production config |
| `core.config.json` | Static file hosting config |
| `scripts/smoke.js` | Smoke test suite |
| `package.json` | NPM scripts (dev, start, smoke) |
| `prisma/schema.prisma` | Database schema |
| `MIGRATION_PLAN.md` | Full migration guide |

---

## 🎯 Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API + Worker (development) |
| `npm run dev:api` | Start API only |
| `npm run dev:worker` | Start Worker only |
| `npm start` | Start API + Worker (production) |
| `npm run start:api` | Start API only (production) |
| `npm run start:worker` | Start Worker only (production) |
| `npm run smoke:dev` | Run smoke tests |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run database migrations |
| `npm run db:studio` | Open Prisma Studio |
| `npm run setup` | Full setup (install + migrate) |

---

## 🔄 Next Steps

1. ✅ **Phase 1 Complete:** Worker entry point created, port conflicts eliminated
2. ⏭️ **Phase 2:** Migrate marketing-dashboard routes to core (see `MIGRATION_PLAN.md`)
3. ⏭️ **Phase 3:** Remove legacy Express servers from frontends
4. ⏭️ **Phase 4:** Deploy to production with PM2

---

## 🆘 Need Help?

- **Migration Plan:** See `MIGRATION_PLAN.md` for detailed architecture
- **API Docs:** Check startup banner for endpoint list
- **Database:** Run `npm run db:studio` for GUI
- **Logs:** Check `pm2 logs` in production

---

**Made with ❤️ by the Cardbey Team**






