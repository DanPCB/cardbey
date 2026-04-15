# P0 Core Consolidation Summary

## Overview

This document summarizes the backend API consolidation for Phase 1, ensuring minimal, stable endpoints for authentication and store management.

**Date:** 2025-01-27  
**Status:** ✅ Complete

---

## PART 1: Endpoint Inventory

### Auth Endpoints

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| POST | `/api/auth/register` | ✅ Normalized | Register new user |
| POST | `/api/auth/login` | ✅ Normalized | Login user |
| GET | `/api/auth/me` | ✅ Normalized | Get current user |
| GET | `/api/auth/profile` | ✅ Added | Get profile (alias of /me) |
| PATCH | `/api/auth/profile` | ✅ Added | Update profile |

### Store Endpoints

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| POST | `/api/stores` | ✅ Normalized | Create store |
| GET | `/api/stores` | ✅ Normalized | List user stores |
| PATCH | `/api/stores/:id` | ✅ Added | Update store (optional) |

---

## PART 2: Normalized Auth Routes

### POST /api/auth/register

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "John Doe"  // optional, maps to displayName
}
```

**Response (201):**
```json
{
  "ok": true,
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "displayName": "John Doe",
    "roles": ["viewer"],
    "onboarding": { ... },
    "hasBusiness": false
  }
}
```

**Errors:**
- `400`: Missing email/password or password too short
- `409`: Email already registered

**Changes Made:**
- ✅ Added `ok: true` to success response
- ✅ Added `fullName` support (maps to `displayName`)
- ✅ Consistent error format: `{ ok: false, error: string, message: string }`
- ✅ Improved error messages

---

### POST /api/auth/login

**Request:**
```json
{
  "email": "user@example.com",  // or "username"
  "password": "password123"
}
```

**Response (200):**
```json
{
  "ok": true,
  "token": "jwt-token-here",
  "accessToken": "jwt-token-here",  // alias for compatibility
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "displayName": "John Doe",
    "roles": ["viewer"],
    "onboarding": { ... },
    "hasBusiness": true,
    "stores": [ ... ]
  }
}
```

**Errors:**
- `400`: Missing email/username or password
- `401`: Invalid credentials

**Changes Made:**
- ✅ Added `ok: true` to success response
- ✅ Added `accessToken` alias for `token`
- ✅ Consistent error format
- ✅ Improved error messages

---

### GET /api/auth/me

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "ok": true,
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "displayName": "John Doe",
    "roles": ["viewer"],
    "onboarding": { ... },
    "hasBusiness": true,
    "stores": [
      {
        "id": "store-id",
        "name": "My Store",
        "slug": "my-store-abc123",
        ...
      }
    ]
  }
}
```

**Errors:**
- `401`: No token, invalid token, expired token, or user not found

**Changes Made:**
- ✅ Added `ok: true` to success response
- ✅ Changed 404 to 401 for user not found (auth issue)
- ✅ Always includes `stores` array (empty if no store)
- ✅ Includes `hasStore` boolean for convenience

---

### GET /api/auth/profile

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** Same as `/api/auth/me`

**Purpose:** Optional alias for `/api/auth/me` for semantic clarity

---

### PATCH /api/auth/profile

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "displayName": "New Name",  // optional
  "email": "newemail@example.com"  // optional
}
```

**Response (200):**
```json
{
  "ok": true,
  "user": {
    // Updated user object with stores
  }
}
```

**Errors:**
- `400`: No fields provided or invalid input
- `401`: Not authenticated
- `409`: Email already in use

**Purpose:** Basic profile updates (name/email)

---

## PART 3: Normalized Store Routes

### POST /api/stores

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "name": "My Store",
  "creationMethod": "manual"  // optional: "manual" | "ai" | "ocr" | "library"
}
```

**Response (201):**
```json
{
  "ok": true,
  "store": {
    "id": "store-id",
    "userId": "user-id",
    "name": "My Store",
    "slug": "my-store-abc123",
    "type": "General",
    "isActive": true,
    ...
  }
}
```

**Errors:**
- `400`: Missing or invalid store name
- `401`: Not authenticated
- `409`: User already has a store

**Changes Made:**
- ✅ Validates `creationMethod` enum
- ✅ Consistent error format
- ✅ Improved error messages

---

### GET /api/stores

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "ok": true,
  "stores": [
    {
      "id": "store-id",
      "name": "My Store",
      ...
    }
  ]
}
```

**Errors:**
- `401`: Not authenticated

**Note:** Returns stores owned by authenticated user, ordered by creation date (newest first)

---

### PATCH /api/stores/:id

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "name": "Updated Store Name",  // optional
  "description": "Store description"  // optional
}
```

**Response (200):**
```json
{
  "ok": true,
  "store": {
    // Updated store object
  }
}
```

**Errors:**
- `400`: No fields to update or invalid input
- `401`: Not authenticated
- `403`: Store does not belong to user
- `404`: Store not found

**Purpose:** Basic store updates (name, description)

---

## PART 4: Error Handling

### Consistent Error Response Format

All endpoints now return errors in a consistent format:

```json
{
  "ok": false,
  "error": "error-code",
  "message": "Human-readable error message"
}
```

### Error Status Codes

- `400`: Bad Request (validation errors, missing fields)
- `401`: Unauthorized (authentication required, invalid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found (resource not found)
- `409`: Conflict (duplicate email, user already has store)
- `500`: Internal Server Error (server-side errors)

### Error Logging

- ✅ All routes log errors to server console with context
- ✅ No stack traces exposed to clients (only in development mode)
- ✅ Friendly error messages for all validation errors

---

## PART 5: API Client Sync

### @cardbey/api-client Updates

**File:** `packages/api-client/src/index.ts`

**Changes:**
1. ✅ `registerUser()` - Updated to send `fullName` instead of `username`
2. ✅ `loginUser()` - Updated to send `email` or `username` (backend accepts both)
3. ✅ `getCurrentUser()` - Updated to handle 401 (returns null) instead of 204
4. ✅ Updated `RegisterResponse` interface to match backend
5. ✅ Updated `LoginResponse` interface to include `accessToken` alias

**Compatibility:**
- ✅ All existing frontend code continues to work
- ✅ Response shapes match backend exactly
- ✅ Error handling consistent across all endpoints

---

## Summary of Changes

### Major Changes

1. **Response Format Standardization**
   - All success responses include `ok: true`
   - All error responses include `ok: false`, `error`, and `message`

2. **Auth Endpoint Improvements**
   - `/auth/register` now accepts `fullName` (maps to `displayName`)
   - `/auth/login` returns both `token` and `accessToken` for compatibility
   - `/auth/me` returns 401 instead of 404 for missing user (auth issue)
   - `/auth/me` always includes `stores` array and `hasStore` boolean

3. **Store Endpoint Improvements**
   - `POST /stores` validates `creationMethod` enum
   - Added `PATCH /stores/:id` for basic updates
   - Consistent error messages

4. **Profile Endpoints Added**
   - `GET /api/auth/profile` (alias of `/auth/me`)
   - `PATCH /api/auth/profile` (basic name/email updates)

5. **Error Handling**
   - Consistent error response format across all endpoints
   - Improved error messages
   - Proper logging without exposing internals

---

## Endpoint Reference

### Auth Endpoints

| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login user |
| GET | `/api/auth/me` | Yes | Get current user |
| GET | `/api/auth/profile` | Yes | Get profile (alias) |
| PATCH | `/api/auth/profile` | Yes | Update profile |

### Store Endpoints

| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| POST | `/api/stores` | Yes | Create store |
| GET | `/api/stores` | Yes | List user stores |
| PATCH | `/api/stores/:id` | Yes | Update store |

---

## Request & Response Shapes

### Register Request
```typescript
{
  email: string;
  password: string;
  fullName?: string;  // optional
}
```

### Register Response
```typescript
{
  ok: true;
  token: string;
  user: User;
}
```

### Login Request
```typescript
{
  email: string;  // or username
  password: string;
}
```

### Login Response
```typescript
{
  ok: true;
  token: string;
  accessToken: string;  // alias
  user: User;
}
```

### Get Me/Profile Response
```typescript
{
  ok: true;
  user: User & {
    stores: Store[];
    hasStore: boolean;
  };
}
```

### Create Store Request
```typescript
{
  name: string;
  creationMethod?: 'manual' | 'ai' | 'ocr' | 'library';
}
```

### Create Store Response
```typescript
{
  ok: true;
  store: Store;
}
```

### List Stores Response
```typescript
{
  ok: true;
  stores: Store[];
}
```

### Update Store Request
```typescript
{
  name?: string;
  description?: string;
}
```

### Update Store Response
```typescript
{
  ok: true;
  store: Store;
}
```

---

## TODOs for Later Phases

### Phase 2+ Features (Not Implemented)

1. **Campaigns**
   - POST /api/campaigns
   - GET /api/campaigns
   - PATCH /api/campaigns/:id
   - DELETE /api/campaigns/:id

2. **Insights**
   - GET /api/insights
   - GET /api/dashboard/insights

3. **Profile Enhancements**
   - PUT /api/auth/password (change password)
   - More profile fields (avatar, preferences, etc.)

4. **Store Enhancements**
   - DELETE /api/stores/:id
   - More store fields (logo, region, etc.)
   - Store settings endpoints

---

## Testing Checklist

- [x] POST /api/auth/register - Success case
- [x] POST /api/auth/register - Duplicate email (409)
- [x] POST /api/auth/register - Validation errors (400)
- [x] POST /api/auth/login - Success case
- [x] POST /api/auth/login - Invalid credentials (401)
- [x] GET /api/auth/me - With valid token
- [x] GET /api/auth/me - With invalid token (401)
- [x] GET /api/auth/me - User with store
- [x] GET /api/auth/me - User without store
- [x] POST /api/stores - Success case
- [x] POST /api/stores - User already has store (409)
- [x] GET /api/stores - List stores
- [x] PATCH /api/stores/:id - Success case
- [x] PATCH /api/stores/:id - Store not found (404)
- [x] PATCH /api/stores/:id - Wrong owner (403)
- [x] PATCH /api/auth/profile - Update displayName
- [x] PATCH /api/auth/profile - Update email
- [x] PATCH /api/auth/profile - Duplicate email (409)

---

## Files Modified

1. `apps/core/cardbey-core/src/routes/auth.js`
   - Normalized register, login, me endpoints
   - Added profile endpoints

2. `apps/core/cardbey-core/src/routes/stores.js`
   - Normalized create and list endpoints
   - Added PATCH endpoint

3. `packages/api-client/src/index.ts`
   - Updated register, login, getCurrentUser functions
   - Updated response interfaces

---

## Notes

- All endpoints use consistent error response format
- All endpoints log errors to server console
- No stack traces exposed to clients (except in development)
- User model uses `displayName` (not `username` or `fullName` in DB)
- Store model is `Business` in Prisma (exposed as `store` in API)
- One-to-one relationship: User → Business (one store per user)
- JWT tokens expire in 7 days (configurable via `JWT_EXPIRES_IN`)

---

**Status:** ✅ All P0 endpoints normalized and tested  
**Next Steps:** Phase 2 features (campaigns, insights, etc.)




