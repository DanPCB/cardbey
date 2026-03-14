# Dynamic QR (Short Code) Implementation Plan

## Audit Summary

### Existing QR/Scan Infrastructure
1. **QR Code Generation:**
   - `QrCodeGenerator.jsx` - Client-side QR for loyalty cards (uses qrcode.react)
   - `PairDeviceModal.tsx` - QR pairing for devices (6-char codes)
   - External API: `qr-server.com` used for generation

2. **Existing Routes:**
   - `/go/:scanId` - Dynamic redirect (`scanRedirect.js`) - uses `Content.settings.scanId`
   - `/q/:publicCode` - Print bag landing (`PrintBagLandingPage.tsx`) - uses SmartObject
   - `/r/:publicId` - Public promo registration
   - `/p/promo/:publicId` - Public promo landing

3. **Tracking Models:**
   - `ActivityEvent` - General event tracking (type: 'promo_scan')
   - `PromoRedemption` - Redemption records
   - **No SmartObjectScan model exists** - Will create `QrScanEvent`
   - **No PromoTracking model in schema** (only in docs)

4. **Image Export:**
   - `PromotionPreview.tsx` - Renders promo templates
   - `generateFromPromo.js` - Stub for signage asset generation
   - QR rendering: Client-side or external API

5. **API Patterns:**
   - `getCoreApiBaseUrl()` exists in `@/lib/coreApiBaseUrl`
   - Routes use `/api/` prefix
   - `scanRedirect.js` already tracks to `ActivityEvent`

## Implementation Plan

### Phase 1: Database Layer ✅ (This task)

**Files to modify:**
- `apps/core/cardbey-core/prisma/schema.prisma` - Add QrLink + QrScanEvent models
- `apps/core/cardbey-core/src/types/qr.ts` - TypeScript enums/types
- `apps/core/cardbey-core/src/services/qr/qrRepo.ts` - Repository helper

**Schema Changes:**
```prisma
enum QrTargetType {
  STORE
  PRODUCT
  PROMO
  URL
}

enum QrLinkStatus {
  ACTIVE
  DISABLED
}

enum QrScanSource {
  PRINT
  SCREEN
  SOCIAL
  UNKNOWN
}

model QrLink {
  id         String        @id @default(cuid())
  code       String        @unique // Short code (6-8 chars)
  targetType QrTargetType
  targetId   String?
  targetUrl  String?
  promoId    String? // Link to PromoRule if targetType=PROMO
  storeId    String?
  tenantId   String?
  status     QrLinkStatus @default(ACTIVE)
  meta       Json? // Future routing rules
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt

  scans      QrScanEvent[]

  @@unique([code])
  @@index([storeId, targetType])
  @@index([tenantId])
  @@index([status])
}

model QrScanEvent {
  id         String        @id @default(cuid())
  qrLinkId   String
  qrLink     QrLink        @relation(fields: [qrLinkId], references: [id], onDelete: Cascade)
  code       String // Denormalized for fast lookups
  storeId    String?
  tenantId   String?
  targetType QrTargetType // Denormalized
  targetId   String? // Denormalized
  userId     String?
  source     QrScanSource  @default(UNKNOWN)
  referrer   String?
  userAgent  String?
  ipHash     String? // SHA-256 hash, never raw IP
  locale     String?
  createdAt  DateTime      @default(now())

  @@index([qrLinkId, createdAt])
  @@index([storeId, createdAt])
  @@index([code, createdAt])
  @@index([tenantId, createdAt])
}
```

### Phase 2: Backend Routes (Next)

**New Routes:**
- `GET /q/:code` - Redirect + tracking (replace/extend `/go/:scanId`)
- `GET /api/public/qr/:code` - Metadata for preview
- `POST /api/qr` - Create/update QR link
- `GET /api/qr/:id/svg` - Render QR SVG

**Files:**
- `apps/core/cardbey-core/src/routes/qrRoutes.js` (new)
- Mount in `server.js` at `/q` and `/api/qr`

### Phase 3: QR Rendering (Next)

**Files:**
- `apps/core/cardbey-core/src/services/qr/qrRenderer.ts` - SVG/PNG generation
- Use `qrcode` npm package server-side
- Add QR layer to `PromotionPreview.tsx` canvas

### Phase 4: Frontend Integration (Next)

**Files:**
- `apps/dashboard/cardbey-marketing-dashboard/src/api/qr.api.ts` (new)
- Update `PromoDeployPage.tsx` to create QR links
- Add QR preview/export to Content Studio

## Decision: Use QrScanEvent (New Model)

**Rationale:**
- `ActivityEvent` is too generic (many event types)
- `QrScanEvent` provides:
  - Specific QR analytics fields (source, referrer, userAgent)
  - Direct FK to QrLink for joins
  - Denormalized fields for fast analytics queries
  - Better type safety

**Migration Strategy:**
- Create new models (no breaking changes)
- Existing `/go/:scanId` can continue using `ActivityEvent` for backward compat
- New `/q/:code` will use `QrScanEvent`

## Compliance

✅ **Single source of truth:** QrLink is canonical QR link model  
✅ **Canonical API base:** Use `getCoreApiBaseUrl()`  
✅ **No duplicate endpoints:** Extend `/q/:code` pattern (already exists for SmartObject)  
✅ **ADR note:** Will document routing decision

