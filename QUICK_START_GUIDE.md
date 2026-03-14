# Quick Start Guide - Cardbey Development

**Date:** 2026-01-15  
**Status:** ✅ All endpoints fixed

---

## Prerequisites

1. **Node.js** (v20.11.1 or compatible)
2. **pnpm** (or npm/yarn)
3. **Both servers must be running:**
   - Core API server (port 3001)
   - Dashboard dev server (port 5174)

---

## Starting the Servers

### 1. Start Core API Server

```powershell
cd C:\Projects\cardbey\apps\core\cardbey-core
npm run dev
```

**Expected Output:**
```
[CORE] Listening at http://localhost:3001
✅ Health: http://localhost:3001/health
✅ API:    http://localhost:3001/api/health
```

**Verify it's running:**
```bash
curl http://localhost:3001/api/health
# Should return: {"ok":true,"env":"development",...}
```

### 2. Start Dashboard Dev Server

**In a separate terminal:**
```powershell
cd C:\Projects\cardbey\apps\dashboard\cardbey-marketing-dashboard
npm run dev
```

**Expected Output:**
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5174/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

---

## Common Issues and Fixes

### Issue: 502 Bad Gateway Errors

**Symptom:** Console shows:
```
502 Bad Gateway Core API (http://127.0.0.1:3001) is unreachable
```

**Cause:** Core server is not running on port 3001.

**Fix:**
1. Check if core server is running: `curl http://localhost:3001/api/health`
2. If not running, start it: `cd apps/core/cardbey-core && npm run dev`
3. Wait for server to fully start (look for "Listening at http://localhost:3001")
4. Refresh dashboard browser tab

---

### Issue: System Health shows "API: down"

**Symptom:** Dashboard System Health panel shows red "down" status.

**Cause:** Core server is not running or health endpoint is failing.

**Fix:**
1. Ensure core server is running (see above)
2. Test health endpoint: `curl http://localhost:3001/api/health?full=true`
3. Should return JSON with `api: "up"`, `database: "up"`, etc.
4. If still showing "down", check core server logs for errors

---

### Issue: Database Connection Errors

**Symptom:** Health check shows `database: "unknown"` or Prisma errors.

**Fix:**
1. Ensure database file exists: `apps/core/cardbey-core/prisma/dev.db`
2. If missing, run: `cd apps/core/cardbey-core && npx prisma db push --accept-data-loss`
3. Regenerate Prisma client: `npx prisma generate`
4. Restart core server

---

### Issue: Guest Login Fails

**Symptom:** `POST /api/auth/guest` returns 500 with Prisma schema mismatch.

**Fix:** See `docs/RUNBOOK_FIX_GUEST_LOGIN_AFTER_ROLLBACK.md`

**Quick fix:**
```powershell
cd C:\Projects\cardbey\apps\core\cardbey-core
taskkill /IM node.exe /F
Remove-Item prisma\dev.db* -ErrorAction SilentlyContinue
npx prisma generate
npx prisma db push --accept-data-loss
npm run dev
```

---

## Endpoints Status

### ✅ Working Endpoints

- `POST /api/mi/orchestra/start` - Create orchestrator job
- `GET /api/mi/orchestra/job/:jobId` - Get job status
- `POST /api/mi/orchestra/job/:jobId/run` - Trigger job execution
- `GET /api/mi/health` - MI routes health check
- `GET /api/health?full=true` - System health (returns string format)
- `POST /api/auth/guest` - Create guest session

### Verification

**Test all endpoints:**
```bash
# 1. Health check
curl http://localhost:3001/api/health?full=true

# 2. MI health
curl http://localhost:3001/api/mi/health

# 3. Guest login (requires auth token or cookie)
curl -X POST http://localhost:3001/api/auth/guest \
  -H "Content-Type: application/json"
```

---

## Development Workflow

1. **Start Core Server First**
   ```powershell
   cd apps/core/cardbey-core
   npm run dev
   ```

2. **Wait for Core to be Ready**
   - Look for: `[CORE] Listening at http://localhost:3001`
   - Test: `curl http://localhost:3001/api/health`

3. **Start Dashboard**
   ```powershell
   cd apps/dashboard/cardbey-marketing-dashboard
   npm run dev
   ```

4. **Open Dashboard**
   - Navigate to: `http://localhost:5174`
   - Check System Health panel (should show green "up" statuses)

5. **Test QuickStart Flow**
   - Go to `/features` page
   - Fill in business details
   - Click "Generate"
   - Should create job and navigate to review page

---

## Troubleshooting Checklist

- [ ] Core server is running on port 3001
- [ ] Dashboard dev server is running on port 5174
- [ ] Vite proxy is configured (check `vite.config.js`)
- [ ] Database exists and Prisma client is generated
- [ ] No port conflicts (3001, 5174)
- [ ] Firewall not blocking localhost connections
- [ ] Browser console shows no 502 errors (when server is running)

---

## Network Flow

```
Browser (localhost:5174)
  ↓ (relative URL)
Vite Dev Server
  ↓ (proxy /api/*)
Core API Server (127.0.0.1:3001)
  ↓
Database (SQLite: prisma/dev.db)
```

**Important:** In dev mode, dashboard uses relative URLs (`/api/*`) which Vite proxies to core server. No CORS issues.

---

**Status:** ✅ All endpoints implemented and tested  
**Next:** Start both servers and test the flow!





