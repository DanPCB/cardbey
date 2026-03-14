# Quick Start Guide - Cardbey Development

## Starting the Servers

### 1. Start Core Backend Server

```bash
cd apps/core/cardbey-core
npm run dev
```

**Expected:** Server starts on `http://localhost:3001` (or port from env)

**Verify:** Open `http://localhost:3001/api/health` - should return `{"ok":true}`

---

### 2. Start Dashboard Frontend

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npm run dev
```

**Expected:** Vite dev server starts on `http://localhost:5173` (or next available port)

**Verify:** Open `http://localhost:5173` - should show login or dashboard

---

## Common Issues

### Issue: "Unable to connect" / "Firefox can't establish connection"

**Cause:** Dashboard dev server not running

**Fix:**
1. Open terminal in `apps/dashboard/cardbey-marketing-dashboard`
2. Run `npm run dev`
3. Wait for "Local: http://localhost:5173" message
4. Refresh browser

---

### Issue: API calls return 404

**Cause:** Core backend server not running

**Fix:**
1. Open terminal in `apps/core/cardbey-core`
2. Run `npm run dev`
3. Verify routes are mounted (check console logs)
4. Test: `curl http://localhost:3001/api/health`

---

### Issue: Port already in use

**Fix:**
```bash
# Find process using port
# Windows:
netstat -ano | findstr :5173
netstat -ano | findstr :3001

# Kill process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Or change port in .env or package.json
```

---

## Development Workflow

1. **Terminal 1:** Core backend (`npm run dev` in `apps/core/cardbey-core`)
2. **Terminal 2:** Dashboard frontend (`npm run dev` in `apps/dashboard/cardbey-marketing-dashboard`)
3. **Browser:** Open `http://localhost:5173`

---

## Quick Test

After both servers are running:

1. Open `http://localhost:5173/app/creative-shell`
2. Click "Start Creating"
3. Enter idea: "Free tasting kebabs"
4. Click "Continue"
5. Should open editor (no 404 errors)

---

## Ports

- **Core Backend:** `3001` (default)
- **Dashboard Frontend:** `5173` (Vite default, or next available)

Check console output for actual ports if different.

