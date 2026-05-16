# Phase 2 Features Summary

## Overview

Implemented three Phase 2 features:
1. **Lightweight Roles & Permissions** - Basic access control
2. **Lightweight Statistics** - Dashboard overview metrics
3. **Google/Facebook OAuth** - Social login support

**Date:** 2025-01-27  
**Status:** ✅ Complete

---

## 1. Lightweight Roles & Permissions

### Database Changes

**User Model** (`prisma/schema.prisma`):
```prisma
role String @default("owner") // "owner" | "staff" | "viewer"
```

### Middleware

**New Middleware** (`src/middleware/auth.js`):
- `requireOwner()` - Only allows `role="owner"`
- `requireStoreAccess()` - Allows `role="owner"` or `role="staff"`, denies `role="viewer"`

### Restricted Routes

1. **PATCH /api/stores/:id** - Requires `requireOwner`
2. **DELETE /api/products/:id** - Requires `requireOwner`
3. **PUT/PATCH /api/screens/:id/playlist** - Requires `requireStoreAccess`

### Read Access

- ✅ All roles can read stores
- ✅ All roles can read products
- ✅ All roles can read screens

### Tests

**File:** `tests/roles.test.js`
- ✅ Owner allowed on restricted routes
- ✅ Staff denied on owner-only routes
- ✅ Staff allowed on store access routes
- ✅ Viewer denied on restricted routes
- ✅ All roles can read (not restricted)

---

## 2. Lightweight Statistics

### New Endpoint

**GET /api/stores/:id/stats**

**Response:**
```json
{
  "ok": true,
  "stats": {
    "products": 10,
    "screens": 5,
    "playlists": 3,
    "lastUpdated": "2025-01-27T12:00:00.000Z"
  }
}
```

### Features

- ✅ Uses existing tables only (no new schema)
- ✅ In-memory cache (60 seconds TTL)
- ✅ Automatic cache cleanup (removes entries older than 5 minutes)
- ✅ Requires authentication
- ✅ Verifies store ownership

### Implementation

- Counts products (excluding soft-deleted)
- Counts screens (all non-deleted screens)
- Counts playlists (all playlists)
- Returns ISO timestamp for `lastUpdated`

### Tests

**File:** `tests/stores.stats.test.js`
- ✅ Returns correct statistics
- ✅ Requires authentication
- ✅ Returns 404 for non-existent store
- ✅ Caches response for 60 seconds
- ✅ Includes correct product count

---

## 3. Google/Facebook OAuth

### Updated OAuth Flow

**Updated Function** (`src/routes/oauth-full.js`):
- `upsertUser()` now:
  - Matches by email (case-insensitive search)
  - Sets `role="owner"` for new users
  - Sets `emailVerified=true` for new users
  - Updates existing users without changing role/verification

### Google OAuth

**New Routes:**
- `GET /oauth/google/start` - Initiate Google OAuth
- `GET /oauth/google/callback` - Handle Google OAuth callback

**Environment Variables:**
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret

**Flow:**
1. User clicks "Login with Google"
2. Redirects to Google OAuth consent screen
3. Google redirects back with authorization code
4. Exchange code for access token
5. Fetch user profile (email, name, picture)
6. Create/update user with `role="owner"`, `emailVerified=true`
7. Generate JWT token
8. Set auth cookie
9. Return bridge page to close popup

### Facebook OAuth

**Existing Routes** (updated):
- `GET /oauth/facebook/start` - Initiate Facebook OAuth
- `GET /oauth/facebook/callback` - Handle Facebook OAuth callback

**Updated Behavior:**
- Now sets `role="owner"` for new users
- Now sets `emailVerified=true` for new users
- Matches by email (case-insensitive)

### User Creation

**New Users:**
```javascript
{
  email: normalizedEmail,
  passwordHash: randomBytes(32), // OAuth-only users
  displayName: profile.name,
  avatarUrl: profile.picture,
  role: 'owner', // Phase 2: Social login users are owners
  emailVerified: true, // Phase 2: OAuth emails are pre-verified
  hasBusiness: false,
  onboarding: {...}
}
```

**Existing Users:**
- Updates `displayName` and `avatarUrl` if provided
- Does NOT change `role` or `emailVerified` (preserves existing values)

---

## Files Modified

### Database
1. `prisma/schema.prisma` - Added `role` field to User model

### Middleware
2. `src/middleware/auth.js` - Added `requireOwner` and `requireStoreAccess`

### Routes
3. `src/routes/stores.js` - Added `requireOwner` to PATCH, added stats endpoint
4. `src/routes/products.js` - Added `requireOwner` to DELETE
5. `src/routes/screens.js` - Added `requireStoreAccess` to playlist assignment
6. `src/routes/oauth-full.js` - Updated `upsertUser`, added Google OAuth

### Tests
7. `tests/roles.test.js` - Role-based access control tests
8. `tests/stores.stats.test.js` - Statistics endpoint tests

---

## Environment Variables

### Google OAuth
```bash
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### Facebook OAuth
```bash
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
```

---

## Migration

### Database Migration

Run migration to add `role` field:

```bash
cd apps/core/cardbey-core
npx prisma migrate dev --name add_user_role_field
```

**Note:** All existing users will have `role="owner"` (default value).

---

## Testing

### Run All Tests

```bash
npm test
```

### Run Specific Tests

```bash
# Roles tests
npm test tests/roles.test.js

# Stats tests
npm test tests/stores.stats.test.js
```

---

## Notes

- **No enterprise RBAC** - Simple three-role system (owner/staff/viewer)
- **No permission matrix** - Role-based only, no granular permissions
- **No UI for roles yet** - Backend only, UI to be added later
- **Read access not restricted** - All roles can read all data
- **OAuth emails pre-verified** - Social login users skip email verification
- **OAuth users are owners** - New social login users get owner role
- **Case-insensitive email matching** - Handles SQLite case-sensitivity

---

**Status:** ✅ All Phase 2 features complete  
**Next Steps:** Run database migration and test endpoints


