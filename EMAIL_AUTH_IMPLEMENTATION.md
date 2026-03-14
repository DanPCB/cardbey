# Email Auth + Browse-First Experience Implementation

## Summary

Implemented email authentication with a frictionless "browse-first" experience. Users can browse and preview stores without login, but actions that persist or cost resources (editing, saving, publishing, creating promos) trigger authentication gates.

## Implementation Details

### 1. Backend Auth (Already Exists)
- ✅ `POST /api/auth/register` - Email + password registration
- ✅ `POST /api/auth/login` - Email + password login  
- ✅ `GET /api/auth/me` - Current user info
- ✅ Guest flow still works for browsing

### 2. Frontend Auth Gating

#### AuthModal Component (`apps/dashboard/cardbey-marketing-dashboard/src/features/auth/AuthModal.tsx`)
- **Enhanced** to support both email/password and email OTP authentication
- **Tabs** for switching between password and OTP methods
- **Sign up / Sign in** toggle
- **Soft mode** (dismissible) vs **Hard mode** (action blocked until auth)
- **Continue as guest** option (only in soft mode)

#### Gatekeeper System (`apps/dashboard/cardbey-marketing-dashboard/src/features/auth/`)
- **useGatekeeper()** hook - Centralized auth/premium gating
- **GateAction** enum - Defines which actions require auth/premium
- **GateReason** enum - AUTH_REQUIRED vs PREMIUM_REQUIRED
- **Pending action** system - Remembers blocked action and resumes after login

#### Gated Actions
1. **Save Draft** (`GateAction.SAVE_CONTENT`) - Requires auth
2. **Publish Store** (`GateAction.PUBLISH_CONTENT`) - Requires auth
3. **Create Promo** (`GateAction.CREATE_PROMO`) - Requires auth + premium

### 3. Store Preview Page (`apps/dashboard/cardbey-marketing-dashboard/src/pages/public/StorePreviewPage.tsx`)
- **5-second soft gate timer** - Shows auth modal after 5 seconds if not authenticated
- **Dismissible** - User can close modal and continue browsing
- **Session storage** - Only shows once per session

### 4. Store Draft Review (`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`)
- **Save button** - Gated with `GateAction.SAVE_CONTENT`
- **Publish button** - Gated with `GateAction.PUBLISH_CONTENT`
- **Create Promo button** - Gated with `GateAction.CREATE_PROMO` + shows Premium badge
- **Premium badge** - Yellow badge on Create Promo button

### 5. Publish Store Endpoint (`apps/core/cardbey-core/src/routes/stores.js`)
- **Bouncer guard** - Uses `bouncerGuard` to resolve draft scope
- **Auth gating** - Returns `needsLogin: true` if not authenticated (200 status, not 401)
- **Draft resolution** - Uses `resolveDraftScope` with `generationRunId` matching
- **Draft commit** - Marks draft as `committed` after successful publish
- **Logging** - Logs `[PUBLISH_STORE]` with draftId, strategy, confidence

## Gated Actions Summary

| Action | Auth Required | Premium Required | Gate Location |
|--------|--------------|------------------|---------------|
| Browse/Preview | ❌ | ❌ | None |
| Save Draft | ✅ | ❌ | `StoreDraftReview.handleSave` |
| Publish Store | ✅ | ❌ | `StoreDraftReview.handlePublish` |
| Create Promo | ✅ | ✅ | `StoreDraftReview.handleCreatePromotion` |

## Manual Test Checklist

### Browse-First Experience
- [ ] Open store preview page as anonymous user
- [ ] Page loads without errors
- [ ] After 5 seconds, auth modal appears (soft mode)
- [ ] Close modal - browsing continues
- [ ] Click "Save" button - auth modal appears immediately (hard mode)
- [ ] Click "Publish" button - auth modal appears immediately (hard mode)
- [ ] Click "Create Promo" button - auth modal appears (hard mode) with premium explanation

### Authentication Flow
- [ ] Sign up with email/password - account created
- [ ] Sign in with email/password - logged in
- [ ] After login, previously blocked action resumes automatically
- [ ] Guest browsing still works (no login required)

### Premium Gating
- [ ] Create Promo button shows "Premium" badge
- [ ] As non-premium user, clicking Create Promo shows upgrade modal
- [ ] As premium user, clicking Create Promo proceeds normally

### Publish Store
- [ ] As authenticated user, click "Publish Store"
- [ ] Store publishes successfully
- [ ] Draft is marked as `committed` in database
- [ ] Public URL is returned
- [ ] Logs show `[PUBLISH_STORE]` with draftId and strategy

## Files Changed

### Frontend
- `apps/dashboard/cardbey-marketing-dashboard/src/features/auth/AuthModal.tsx` - Enhanced with password support
- `apps/dashboard/cardbey-marketing-dashboard/src/features/auth/GatekeeperProvider.tsx` - Added mode prop
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` - Wired up gating
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/StorePreviewPage.tsx` - Added 5-second timer
- `apps/dashboard/cardbey-marketing-dashboard/src/api/storeDraft.ts` - Added needsLogin handling

### Backend
- `apps/core/cardbey-core/src/routes/stores.js` - Enhanced publish endpoint with draft resolution and logging

## Notes

- **No breaking changes** - Guest browsing still works
- **Single source of truth** - All gating logic in `useGatekeeper` hook
- **Pending actions** - System remembers blocked actions and resumes after auth
- **Soft vs Hard gates** - Soft gates are dismissible, hard gates block actions
- **Premium badge** - Visual indicator on Create Promo button
- **Draft resolution** - Publish uses same `resolveDraftScope` as Power Fix and draft fetch

