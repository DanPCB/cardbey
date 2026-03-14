# Email Auth & Publish Store Implementation Plan

## Status: Implementation in Progress

This document tracks the implementation of:
1. Email Authentication (OTP/magic link)
2. Store Publishing (public store pages)

## Implementation Steps

### Phase 1: Database Schema ✅ (Next: Add to schema.prisma)

**EmailLoginToken Model:**
```prisma
model EmailLoginToken {
  id        String   @id @default(cuid())
  email     String
  codeHash  String   // Hashed OTP code (6 digits)
  tokenHash String?  // Hashed magic link token (optional, if using magic links)
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())
  ipHash    String?  // Hashed IP for rate limiting
  userAgent String?

  @@index([email, expiresAt])
  @@index([codeHash])
  @@index([tokenHash])
}
```

**Business Model Updates:**
```prisma
// Add to existing Business model:
status      String    @default("draft") // 'draft' | 'published'
publishedAt DateTime?
publicSlug  String?   @unique // Public-facing slug (different from slug if needed)

@@index([status])
@@index([publicSlug])
```

### Phase 2: Backend Endpoints

**Email Auth Routes** (`apps/core/cardbey-core/src/routes/auth.js`):
- POST /api/auth/email/start - Request OTP
- POST /api/auth/email/verify - Verify OTP and login

**Store Publish Routes** (`apps/core/cardbey-core/src/routes/stores.js` or new file):
- POST /api/store/:id/publish - Publish store
- GET /api/public/store/:slug - Get public store data

### Phase 3: Email Sender Adapter

**File:** `apps/core/cardbey-core/src/services/emailSender.js`
- DEV: console.log OTP/code
- PROD: Use Resend/SendGrid/etc via env vars

### Phase 4: Frontend

**Email Login UI:**
- `/login/email` route
- Email input → OTP input → Auto-login

**Publish Store UI:**
- "Publish Store" button in dashboard
- Copy public link
- Public store page at `/s/:slug`

## Files to Create/Modify

1. `apps/core/cardbey-core/prisma/schema.prisma` - Add models
2. `apps/core/cardbey-core/src/routes/auth.js` - Add email endpoints
3. `apps/core/cardbey-core/src/services/emailSender.js` - Email adapter
4. `apps/core/cardbey-core/src/services/storePublish.js` - Publish logic
5. `apps/core/cardbey-core/src/routes/stores.js` - Publish/public endpoints
6. `apps/dashboard/cardbey-marketing-dashboard/src/pages/login/EmailLoginPage.tsx` - Email login UI
7. `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/PublicStorePage.tsx` - Public store view

## Manual QA Checklist

**Email Auth:**
- [ ] Enter email → receive OTP (check console in dev)
- [ ] Enter OTP → authenticated session
- [ ] /api/auth/me returns user after login
- [ ] Guest flow still works

**Publish Store:**
- [ ] Create store → publish → get public URL
- [ ] Open public URL in incognito → store loads
- [ ] Dashboard "Copy link" button works
- [ ] Public page shows products


