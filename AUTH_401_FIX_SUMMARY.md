# Auth 401 Fix Summary

## Problem
- GET `/api/auth/me` returns 401
- GET `/api/store/:id/context` returns 401
- POST `/api/mi/promo/from-draft` returns 500 (missing auth context)

## Root Cause
1. **Login endpoint doesn't set cookies** - Only returns token in JSON response
2. **Frontend may not be sending Authorization header** - Relies on cookies that don't exist
3. **Vite proxy may not forward cookies correctly** - Need to ensure cookie forwarding

## Solution: Strategy B - Vite Proxy with Cookies

### Changes Made

#### 1. Backend: Login Endpoint Sets Cookies
**File:** `apps/core/cardbey-core/src/routes/auth.js`

- Added cookie setting after successful login
- Sets `token` cookie with:
  - `httpOnly: true`
  - `secure: false` in dev, `true` in production
  - `sameSite: 'lax'`
  - `maxAge: 7 days`
  - `path: '/'`

#### 2. Backend: Enhanced Auth Middleware Debug Logging
**File:** `apps/core/cardbey-core/src/middleware/auth.js`

- Added debug logging to show:
  - Origin header
  - Authorization header presence
  - Cookie presence
  - All cookie keys

#### 3. Frontend: Vite Proxy Cookie Forwarding
**File:** `apps/dashboard/cardbey-marketing-dashboard/vite.config.js`

- Added `cookieDomainRewrite: ''` to proxy config
- Added `cookiePathRewrite: '/'` to proxy config
- Ensures cookies are forwarded correctly through proxy

#### 4. Frontend: API Client Uses Vite Proxy
**File:** `packages/api-client/src/index.ts`

- Already returns empty string in browser mode (uses relative URLs)
- Enhanced to detect Vite dev server (port 5174) explicitly
- All requests go through `/api/*` proxy (same-origin, cookies work)

#### 5. Frontend: Credentials Always Included
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`

- Already uses `credentials: 'include'` for all requests
- No changes needed

## How It Works

### Flow Diagram
```
User logs in
  ↓
POST /api/auth/login (via Vite proxy)
  ↓
Backend validates credentials
  ↓
Backend sets cookie: token=<JWT>
  ↓
Cookie sent back through Vite proxy
  ↓
Browser stores cookie (domain: localhost, path: /)
  ↓
Subsequent requests:
  - GET /api/auth/me (via Vite proxy)
  - Cookie automatically sent (credentials: 'include')
  - Backend reads cookie: req.cookies.token
  - Auth middleware validates token
  ↓
200 OK with user data
```

### Cookie Attributes
- **Domain:** Not set (works for both localhost:5174 and localhost:3001)
- **Path:** `/` (available to all routes)
- **SameSite:** `lax` (works for same-origin and top-level navigation)
- **Secure:** `false` in dev (allows HTTP), `true` in production
- **HttpOnly:** `true` (prevents XSS)

## Testing Steps

1. **Clear cookies and localStorage:**
   ```javascript
   localStorage.clear();
   document.cookie.split(";").forEach(c => {
     document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
   });
   ```

2. **Login:**
   ```javascript
   await fetch('/api/auth/login', {
     method: 'POST',
     credentials: 'include',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ username: 'admin', password: 'password' })
   });
   ```

3. **Check cookies (DevTools → Application → Cookies):**
   - Should see `token` cookie
   - Domain: `localhost`
   - Path: `/`
   - HttpOnly: ✓
   - SameSite: `Lax`

4. **Test /api/auth/me:**
   ```javascript
   await fetch('/api/auth/me', { credentials: 'include' });
   ```
   - Should return 200 OK with user data

5. **Test /api/store/:id/context:**
   ```javascript
   await fetch('/api/store/cmjwx732p0005jvmwbsuupek8/context', { credentials: 'include' });
   ```
   - Should return 200 OK with store context

## Files Changed

1. **`apps/core/cardbey-core/src/routes/auth.js`**
   - Added cookie setting in login endpoint

2. **`apps/core/cardbey-core/src/middleware/auth.js`**
   - Added debug logging for auth checks

3. **`apps/dashboard/cardbey-marketing-dashboard/vite.config.js`**
   - Added cookie forwarding configuration

4. **`packages/api-client/src/index.ts`**
   - Enhanced Vite dev server detection

## Debug Mode

Enable debug logging:
```javascript
localStorage.setItem('cardbey.debug', 'true');
```

Backend debug logging (automatic in dev mode):
- Shows origin, headers, cookies for each auth check
- Logs when token is missing or invalid

## Acceptance Criteria

✅ Login sets `token` cookie  
✅ Cookie is forwarded through Vite proxy  
✅ `/api/auth/me` returns 200 (reads cookie)  
✅ `/api/store/:id/context` returns 200 (reads cookie)  
✅ No 401s in console  
✅ POST `/api/mi/promo/from-draft` works (has auth context)  



















