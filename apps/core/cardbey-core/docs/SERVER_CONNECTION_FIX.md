# Server Connection Fix

## Current Error
```
Connection refused at http://172.20.10.4:3001
CORS request did not succeed
NS_ERROR_CONNECTION_REFUSED
```

## Root Cause

The server is **not running** or **crashed during startup**. This is likely because:

1. **Database migration not applied** - The server crashes when trying to access `Business.translations` column that doesn't exist
2. **Server not started** - The server process isn't running
3. **Port conflict** - Another process is using port 3001

## Solution Steps

### Step 1: Fix Database Migration (CRITICAL)

**Stop the server first** (if it's running), then:

```powershell
# Apply database schema changes
npx prisma db push --accept-data-loss

# Regenerate Prisma client
npx prisma generate
```

This will add the missing `translations` columns and `CreativeTemplate` table.

### Step 2: Start the Server

```powershell
npm run dev
```

You should see:
```
[CORE] Listening at http://localhost:3001
🌐 LAN:   http://172.20.10.4:3001
```

### Step 3: Verify Server is Running

Check if the server is accessible:

```powershell
# Test health endpoint
curl http://localhost:3001/health

# Or test from browser
# http://172.20.10.4:3001/health
```

### Step 4: Check CORS Configuration

I've added `http://172.20.10.4:3001` and related URLs to the CORS whitelist in `src/config/cors.js`. The server should now accept connections from this IP.

## Troubleshooting

### If Port 3001 is Already in Use

```powershell
# Find process using port 3001
netstat -ano | findstr :3001

# Kill the process (replace <PID> with actual process ID)
taskkill /PID <PID> /F
```

### If Server Crashes on Startup

Check the console output for errors. Common issues:

1. **Database connection error** - Make sure `prisma/dev.db` exists
2. **Missing environment variables** - Check `.env` file
3. **Prisma client not generated** - Run `npx prisma generate`

### If CORS Errors Persist

The CORS configuration now allows:
- `http://172.20.10.4:3001` (server)
- `http://172.20.10.4:5174` (dashboard)
- `http://172.20.10.4:3000` (alternative)

In development mode, CORS allows all origins, so this shouldn't be an issue.

## Expected Behavior After Fix

✅ Server starts without errors  
✅ Health endpoint responds: `http://172.20.10.4:3001/health`  
✅ API endpoints work: `http://172.20.10.4:3001/api/v2/flags`  
✅ SSE stream works: `http://172.20.10.4:3001/api/stream?key=admin`  
✅ No CORS errors in browser console  
✅ Dashboard can connect to server  

## Quick Checklist

- [ ] Database migration applied (`npx prisma db push`)
- [ ] Prisma client regenerated (`npx prisma generate`)
- [ ] Server started (`npm run dev`)
- [ ] Server listening on port 3001
- [ ] Health endpoint responds
- [ ] No errors in server console
- [ ] CORS whitelist includes `172.20.10.4`



