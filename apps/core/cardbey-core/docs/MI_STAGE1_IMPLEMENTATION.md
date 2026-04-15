# MI (Merged Intelligence) Stage 1 Implementation

## Overview

This document describes the implementation of Stage 1 of the MI system for the Cardbey Creative Engine. Stage 1 focuses on defining the data shape and returning MIEntity objects from Creative Engine endpoints.

## What Was Implemented

### 1. Shared MI Types

**Location:** `apps/core/cardbey-core/src/mi/miTypes.ts`

All MI types are defined in this file, including:
- `MIProductType`: poster, video, pdf_report, packaging, screen_item, generic
- `MIMediaType`: image, video, pdf, print_layout, text, 3d
- `MIBrainRole`: event_promoter, insights_explainer, brand_carrier, in_store_attractor, etc.
- `MIEntity`: The main entity type containing productId, productType, format, origin, and miBrain

**Export:** Types are exported from `packages/ai-types/src/index.ts` for shared use across backend and frontend.

### 2. MIEntity Builder Helper

**Location:** `apps/core/cardbey-core/src/mi/buildMIEntity.ts`

The `buildMIEntity()` function constructs MIEntity objects with sensible defaults based on:
- Product type (poster, video, pdf_report, etc.)
- Asset metadata (dimensions, duration, URLs)
- Context (tenantId, storeId, campaignId)
- User information (createdByUserId)

**Features:**
- Automatically determines role and primaryIntent based on productType
- Sets up capabilities (personalisation, localisation, channelAdaptation, etc.)
- Configures behavior rules (onView, onClick events)
- Builds CTA plans based on product type
- Sets up analytics plans with appropriate KPIs
- Configures lifecycle with status and regeneration policy

### 3. Updated Creative Engine Endpoints

#### Signage Asset Upload
**Endpoint:** `POST /api/signage-assets/upload`
**File:** `apps/core/cardbey-core/src/routes/signageRoutes.js`

- Returns MIEntity in the `entity` field
- Maintains backward compatibility with existing `asset` field
- Product type: `screen_item` for images, `video` for videos

#### Menu Asset Generation
**Function:** `generateFromMenu()`
**File:** `apps/core/cardbey-core/src/engines/signage/generateFromMenu.ts`

- Returns array of MIEntity objects in `data.entities`
- Each generated poster asset gets an MIEntity
- Product type: `poster`

#### Insights PDF Reports
**Endpoint:** `GET /api/reports/:id`
**File:** `apps/core/cardbey-core/src/routes/reports.js`

- Returns MIEntity in the `entity` field for PDF reports
- Product type: `pdf_report`
- Role: `insights_explainer`
- Primary intent: `explain_store_performance`

### 4. Unit Tests

**Location:** `apps/core/cardbey-core/src/mi/buildMIEntity.test.ts`

Tests cover:
- Poster asset generation with campaign context
- PDF report generation
- Screen video item generation
- Packaging asset generation
- Default value handling
- Data bindings enabled/disabled based on campaignId

## MIEntity Structure

Each MIEntity contains:

```typescript
{
  productId: string;           // Asset ID
  productType: MIProductType; // poster, video, pdf_report, etc.
  format: {
    mediaType: MIMediaType;   // image, video, pdf, etc.
    dimensions?: string;      // "1080x1920"
    orientation?: string;     // vertical, horizontal, square
    fileUrl: string;         // Main asset URL
    previewUrl?: string;      // Thumbnail/preview URL
    durationSec?: number;     // For videos
  },
  origin: {
    createdByUserId: string;
    createdByEngine: string;  // "creative_engine_v3"
    sourceProjectId?: string; // Campaign/project ID
    createdAt: string;        // ISO timestamp
  },
  miBrain: {
    role: MIBrainRole;        // event_promoter, insights_explainer, etc.
    primaryIntent: string;    // drive_event_signups, explain_store_performance, etc.
    context: {
      tenantId?: string;
      storeId?: string;
      campaignId?: string;
      locales?: string[];     // ["vi-VN", "en-AU"]
      channels?: string[];     // ["whatsapp", "facebook", "cnet_screen"]
      environmentHints?: {
        isPhysical?: boolean;
        isOnDeviceEngine?: boolean;
        timeZone?: string;
      }
    },
    capabilities: {
      personalisation?: { enabled: boolean };
      localisation?: { autoTranslate: boolean };
      channelAdaptation?: { enabled: boolean };
      dynamicLayout?: { enabled: boolean; allowedVariants?: string[] };
      dataBindings?: { enabled: boolean; bindings?: Array<{key: string; source: string}> };
    },
    behaviorRules: {
      onView?: Array<{ action: string; payload: any }>;
      onClick?: Array<{ action: string; payload: any }>;
    },
    ctaPlan?: {
      primaryCTA?: { labelKey: string; targetType: string; targetValuePath?: string };
    },
    analyticsPlan: {
      kpis?: string[];         // ["impressions", "cta_clicks"]
      attribution?: { sourceTag: string };
    },
    lifecycle: {
      status: "active";
      validFrom: string;      // ISO timestamp
      regenerationPolicy: { autoRegenerate: false };
    }
  }
}
```

## Product Type Mappings

| Product Type | Role | Primary Intent | Channels | KPIs |
|-------------|------|---------------|----------|------|
| poster | event_promoter (if campaignId) | drive_event_signups | whatsapp, facebook, instagram | impressions, cta_clicks |
| pdf_report | insights_explainer | explain_store_performance | email, dashboard_download | report_views, report_downloads |
| packaging | brand_carrier | extend_brand_experience | in_store | impressions |
| screen_item | in_store_attractor | attract_attention_to_promo | cnet_screen | impressions, cta_clicks |
| video | event_promoter (if campaignId) | drive_event_signups | whatsapp, facebook, instagram, cnet_screen | impressions, views, cta_clicks |

## Backward Compatibility

All endpoints maintain backward compatibility:
- Existing response fields remain unchanged
- MIEntity is added as an additional `entity` field
- Frontends can gradually migrate to use `entity` instead of old fields

## Next Steps (Future Stages)

- Stage 2: Implement Orchestrator to read miBrain and make decisions
- Stage 3: Implement Device Engine to execute behavior rules
- Stage 4: Implement analytics collection based on analyticsPlan
- Stage 5: Implement dynamic regeneration based on lifecycle.regenerationPolicy

## Testing

Run unit tests:
```bash
cd apps/core/cardbey-core
npm test src/mi/buildMIEntity.test.ts
```

## Files Modified/Created

### Created:
- `apps/core/cardbey-core/src/mi/buildMIEntity.ts` - Helper function
- `apps/core/cardbey-core/src/mi/buildMIEntity.test.ts` - Unit tests
- `apps/core/cardbey-core/docs/MI_STAGE1_IMPLEMENTATION.md` - This document

### Modified:
- `apps/core/cardbey-core/packages/ai-types/src/index.ts` - Export MI types
- `apps/core/cardbey-core/src/routes/signageRoutes.js` - Add MIEntity to response
- `apps/core/cardbey-core/src/engines/signage/generateFromMenu.ts` - Return MIEntity array
- `apps/core/cardbey-core/src/routes/reports.js` - Add MIEntity to report response

### Existing (used as-is):
- `apps/core/cardbey-core/src/mi/miTypes.ts` - Type definitions (already existed)
