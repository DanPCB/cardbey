# Auth Register 404 Error Fix

## Issue
The `/api/auth/register` endpoint returns `404 Not Found` on the deployed server (onrender.com), even though the route exists in the codebase.

## Root Cause
The deployed server on Render doesn't have the latest code with the register route, or the server hasn't been restarted after the route was added.

## Verification

### Route Definition
- **File:** `apps/core/cardbey-core/src/routes/auth.js`
- **Line:** 47
- **Route:** `router.post('/register', ...)`
- **Export:** `export default router` (line 931)

### Route Mounting
- **File:** `apps/core/cardbey-core/src/server.js`
- **Line:** 623
- **Mount:** `app.use('/api/auth', authRoutes)`

### Expected URL
- **Full Path:** `/api/auth/register`
- **Method:** `POST`
- **Frontend Call:** `/auth/register` (converted to `/api/auth/register` by api-client)

## Solution

### Step 1: Verify Route is in Code
The route is correctly defined at `apps/core/cardbey-core/src/routes/auth.js:47`.

### Step 2: Restart/Redeploy Server
1. **On Render:**
   - Go to your Cardbey Core service dashboard
   - Click "Manual Deploy" or trigger a new deployment
   - Wait for deployment to complete

2. **Local Development:**
   ```bash
   cd apps/core/cardbey-core
   npm run dev
   # or
   npm start
   ```

### Step 3: Test the Route
After restart, test the route:

```bash
# Test route accessibility
curl -X GET https://your-core-url.onrender.com/api/auth/test

# Test register endpoint
curl -X POST https://your-core-url.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","fullName":"Test User"}'
```

### Step 4: Check Backend Logs
After restart, when you try to register, you should see:
```
[AUTH] Register endpoint hit { method: 'POST', path: '/register', ... }
```

If you don't see this log, the route isn't being hit (still 404).

## Debug Routes Added

I've added two debug routes to help diagnose:

1. **GET /api/auth/test** - Returns `{ ok: true, message: 'Auth router is working' }`
   - Use this to verify the auth router is accessible

2. **Debug logging in POST /api/auth/register**
   - Logs when the endpoint is hit
   - Shows request details

## Frontend Error Handling

The frontend correctly:
- Calls `/auth/register` via `@cardbey/api-client`
- `api-client` converts it to `/api/auth/register`
- Handles 404 errors appropriately

## Expected Behavior After Fix

1. **Successful Registration:**
   ```json
   {
     "ok": true,
     "user": { ... },
     "token": "jwt-token-here"
   }
   ```

2. **Validation Errors (400):**
   ```json
   {
     "ok": false,
     "error": "Email and password are required",
     "message": "Email and password are required"
   }
   ```

3. **Conflict (409):**
   ```json
   {
     "ok": false,
     "error": "Email already registered",
     "message": "This email is already registered..."
   }
   ```

## Files Modified

- `apps/core/cardbey-core/src/routes/auth.js`
  - Added debug logging to register endpoint
  - Added test route at `/test`

## Next Steps

1. **Redeploy the Cardbey Core server on Render**
2. **Test the `/api/auth/test` endpoint** to verify router is accessible
3. **Try registration again** - should work after deployment
4. **Check backend logs** for the debug message when register is called

## Notes

- The login endpoint works (returns 401 for invalid credentials), confirming auth routes are mounted
- The register endpoint exists in code but returns 404, indicating deployment issue
- After redeployment, both endpoints should work correctly
