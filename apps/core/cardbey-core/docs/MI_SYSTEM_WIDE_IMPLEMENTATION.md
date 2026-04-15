# MI (Merged Intelligence) System-Wide Implementation

## Overview

This document describes the system-wide implementation of the MI layer across Cardbey. MI entities (mini-brains) are now attached to all Creative Engine products, Insights reports, and Device Engine screen items.

**📖 For detailed process flows, see [MI_PROCESS_FLOW.md](./MI_PROCESS_FLOW.md)**

## What Was Implemented

### 1. Prisma Model

**Location:** `apps/core/cardbey-core/prisma/schema.prisma`

Added `MIEntity` model with:
- Product identification (productId, productType, mediaType)
- Format information (fileUrl, previewUrl, dimensions, orientation, durationSec)
- Origin tracking (createdByUserId, createdByEngine, sourceProjectId, createdAt)
- Context (tenantId, storeId, campaignId)
- Links to other entities (creativeAssetId, reportId, screenItemId, packagingId)
- MI Brain JSON field storing full MIBrain object
- Lifecycle (status, validFrom, validTo)
- Indexes on tenantId, storeId, campaignId, productType, status, and link fields
- Unique constraints on link fields to ensure one MIEntity per linked entity

**Migration:** `add_mi_entity` migration created and applied.

### 2. MIService

**Location:** `apps/core/cardbey-core/src/services/miService.ts`

Service methods:
- `registerOrUpdateEntity(input)` - Register new or update existing MIEntity
  - Checks for existing entity by link (creativeAssetId, reportId, screenItemId)
  - Updates if exists, creates if new
  - Stores full miBrain object in JSON column
- `getEntityById(id)` - Get MIEntity by ID
- `getEntityByProductId(productId)` - Get MIEntity by productId
- `getEntityByLink(filters)` - Get MIEntity by linked asset (creativeAssetId, reportId, screenItemId)
- `getEntitiesByContext(filters)` - Query MIEntities by context filters
  - Supports filtering by tenantId, storeId, campaignId, productType, status
  - Role filtering done in-memory (can be optimized with raw SQL if needed)
- `deleteEntity(id)` - Delete MIEntity by ID

### 3. Integration with Creative Engine

**Signage Asset Upload** (`POST /api/signage-assets/upload`)
- After asset creation, builds MIEntity using `buildMIEntity()`
- Registers MIEntity in database via `registerOrUpdateEntity()`
- Returns both `entity` (type) and `miEntity` (database record) in response

**Menu Asset Generation** (`generateFromMenu()`)
- For each generated poster asset, builds and registers MIEntity
- Returns array of MIEntity objects in `data.entities`

**Asset Detail Endpoint** (`GET /api/signage-assets/:id`)
- Fetches asset and associated MIEntity
- Returns both asset and miEntity in response

### 4. Integration with Insights/Reports

**Report Detail Endpoint** (`GET /api/reports/:id`)
- For PDF reports (daily_tenant, daily_device, content_studio_activity):
  - Checks if MIEntity already exists for report
  - If not, builds and registers new MIEntity
  - Returns both `entity` (type) and `miEntity` (database record)

### 5. MIInspectorPanel UI Component

**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/components/MIInspectorPanel.tsx`

React component that displays:
- **Header**: Product type, role, and status badges
- **Primary Intent**: Main intent and secondary intents
- **Context**: Tenant, store, campaign, locales, channels, timezone
- **Capabilities**: Toggles showing ON/OFF for:
  - Personalisation
  - Localisation
  - Channel Adaptation
  - Dynamic Layout
  - Data Bindings
- **Behavior Rules**: Lists onView and onClick actions
- **CTA Plan**: Primary CTA details (label, type, path)
- **Analytics**: KPIs and attribution source
- **Lifecycle**: Status, valid from/to dates, regeneration policy

**Usage:**
```tsx
import { MIInspectorPanel } from '@/components/MIInspectorPanel';

<MIInspectorPanel entity={miEntity} />
```

The component handles null entities gracefully, showing "No MI Brain attached" message.

### 6. Testing

**Backend Tests** (`src/services/miService.test.ts`)
- Tests for registering new entities
- Tests for updating existing entities (same link)
- Tests for querying by ID, link, and context
- Tests for deleting entities
- Tests for role filtering

**UI Component**: Ready for integration tests (can be added to detail pages)

## API Response Changes

### Signage Asset Upload
```json
{
  "ok": true,
  "asset": { ... },
  "entity": { ... },      // MIEntity type (backward compatibility)
  "miEntity": { ... }      // Registered MIEntity database record
}
```

### Report Detail
```json
{
  "ok": true,
  "report": { ... },
  "entity": { ... },       // MIEntity type (backward compatibility)
  "miEntity": { ... }      // Registered MIEntity database record
}
```

### Asset Detail
```json
{
  "ok": true,
  "asset": { ... },
  "miEntity": { ... }      // MIEntity record if exists, null otherwise
}
```

## Database Schema

```prisma
model MIEntity {
  id          String   @id @default(cuid())
  productId   String
  productType String
  mediaType   String
  fileUrl     String
  previewUrl  String?
  dimensions  String?
  orientation String?
  durationSec Int?
  createdByUserId String
  createdByEngine  String
  sourceProjectId String?
  createdAt   DateTime @default(now())
  tenantId    String?
  storeId     String?
  campaignId  String?
  creativeAssetId String? @unique
  reportId    String? @unique
  screenItemId String? @unique
  packagingId String?
  miBrain     Json
  status      String   @default("active")
  validFrom   DateTime?
  validTo     DateTime?
  updatedAt   DateTime @updatedAt
  
  @@index([productId])
  @@index([productType])
  @@index([tenantId])
  @@index([storeId])
  @@index([campaignId])
  @@index([creativeAssetId])
  @@index([reportId])
  @@index([screenItemId])
  @@index([status])
  @@index([createdByUserId])
}
```

## Next Steps

1. **UI Integration**: Add MIInspectorPanel to detail pages:
   - Asset detail pages
   - Report detail pages
   - Screen item detail pages

2. **Device Engine Integration**: Add MIEntity registration when screen items/playlist items are created

3. **Packaging Integration**: Add MIEntity support for packaging assets (when implemented)

4. **Orchestrator Integration**: Read miBrain from MIEntity records to make decisions

5. **Device Engine Execution**: Execute behavior rules from miBrain

6. **Analytics Collection**: Track KPIs defined in analyticsPlan

## Files Created/Modified

### Created:
- `prisma/migrations/.../add_mi_entity/migration.sql` - Database migration
- `src/services/miService.ts` - MI service implementation
- `src/services/miService.test.ts` - Service tests
- `src/components/MIInspectorPanel.tsx` - UI component
- `docs/MI_SYSTEM_WIDE_IMPLEMENTATION.md` - This document

### Modified:
- `prisma/schema.prisma` - Added MIEntity model
- `src/routes/signageRoutes.js` - Added MIEntity registration and detail endpoint
- `src/engines/signage/generateFromMenu.ts` - Added MIEntity registration
- `src/routes/reports.js` - Added MIEntity registration and retrieval

## Usage Example

### Backend: Register MIEntity
```typescript
import { registerOrUpdateEntity } from '../services/miService.js';
import { buildMIEntity } from '../mi/buildMIEntity.js';

const miEntityType = buildMIEntity({ ... });
const miEntityRecord = await registerOrUpdateEntity({
  productId: miEntityType.productId,
  productType: miEntityType.productType,
  mediaType: miEntityType.format.mediaType,
  fileUrl: miEntityType.format.fileUrl,
  // ... other fields
  miBrain: miEntityType.miBrain,
  links: {
    creativeAssetId: asset.id,
  },
});
```

### Frontend: Display MIEntity
```tsx
import { MIInspectorPanel } from '@/components/MIInspectorPanel';

function AssetDetailPage({ asset, miEntity }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        {/* Main asset content */}
        <AssetPreview asset={asset} />
      </div>
      <div>
        {/* MI Brain inspector */}
        <MIInspectorPanel entity={miEntity} />
      </div>
    </div>
  );
}
```

## Testing

Run backend tests:
```bash
cd apps/core/cardbey-core
npm test src/services/miService.test.ts
```

Run Prisma migration:
```bash
cd apps/core/cardbey-core
npx prisma migrate dev
```
