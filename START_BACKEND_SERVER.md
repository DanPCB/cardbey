# Starting the Backend Server

## Quick Start

The backend server needs to be running on port 3001 for the frontend to work.

### Option 1: Using npm (Recommended)

```bash
cd apps/core/cardbey-core
npm run dev
```

This will:
- Start the server on port 3001
- Watch for file changes and auto-restart
- Use nodemon for hot reloading

### Option 2: Using tsx directly

```bash
cd apps/core/cardbey-core
npm start
```

### Option 3: Check if port is already in use

If you get a "port already in use" error:

```bash
# Windows PowerShell
netstat -ano | findstr :3001

# Kill the process if needed (replace PID with the actual process ID)
taskkill /PID <PID> /F
```

## Verification

Once the server starts, you should see:
```
[CORE] Server listening on port 3001
[CORE] Routes: /health, /healthz, /readyz, /api/ping, /api/health, ...
```

## Test the Server

```bash
# Test health endpoint
curl http://localhost:3001/api/health

# Test flags endpoint
curl http://localhost:3001/api/v2/flags
```

## Common Issues

1. **Port 3001 already in use**: Kill the existing process or change the port
2. **Parse errors**: Check the console output for syntax errors
3. **Database connection errors**: Ensure Prisma is set up and database is accessible

## Current Status

After fixing the parse error in `miRoutes.js`, the server should start successfully. All compatibility routes are in place:
- ✅ `POST /api/mi/infer` → forwards to `/api/mi/orchestra/infer`
- ✅ `POST /api/mi/start` → forwards to `/api/mi/orchestra/start`
- ✅ `GET /api/stores/:storeId/draft` → compatibility route
- ✅ `GET /api/public/store/:storeId/draft` → compatibility route
- ✅ `GET /api/v2/flags` → flags endpoint

