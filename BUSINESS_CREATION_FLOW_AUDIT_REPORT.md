# Business Creation Flow Audit Report

**Date:** 2025-01-XX  
**Auditor:** AI Codebase Auditor  
**Scope:** Analysis of existing business creation flow using AI and templates

---

## 1. Overview

### Current State Summary

- **Basic store creation exists**: Users can create a store manually via `POST /api/stores` with just a name. The backend creates a `Business` entity with minimal fields (name, type='General', slug, description, logo, region, isActive).

- **AI/Template-driven business builder is partially implemented**: There is a `/api/ai/store/bootstrap` endpoint that supports three modes (`ocr`, `ai_description`, `template`), but:
  - OCR mode requires pre-extracted text (no image upload UI)
  - AI description mode uses mock product generation (not real AI)
  - Template mode uses hardcoded mock templates (cafe-menu, bakery, salon)
  - **None of these modes generate brand colors, taglines, or business profiles**

- **Template system is advanced but disconnected**: The Creative Engine has a sophisticated template instantiation system (`instantiateCreativeTemplateForContext`) that can:
  - Auto-fill templates with business data via `sourceKey` paths (e.g., `business.name`)
  - Generate AI text for empty slots when `autoFillText=true`
  - But this is only used when manually selecting templates, not during business creation

- **Onboarding flow is basic**: New users see `WelcomeCreateStore` with 4 options (AI, OCR, Library, Manual), but only "Manual" works. The other three show "Coming Soon" toasts.

- **No business profile object**: There is no unified `BusinessProfile` object that contains brand colors, taglines, hero text, or style preferences. The `Business` model only has basic fields (name, type, description, logo, address, phone).

- **Template picker is not business-aware**: The `SmartTemplatePicker` and `TemplateCategorySlider` can filter by channel/role/intent, but they don't filter by business type (coffee shop, salon, etc.) or suggest templates based on the business category.

### How Close to Target Experience?

**Current Gap: ~40% complete**

- ✅ Store creation backend exists
- ✅ OCR pipeline exists (but not connected to business creation)
- ✅ Template instantiation system exists
- 🟡 AI product generation exists but is mock/stub
- 🔴 No business profile generation (colors, taglines, style)
- 🔴 No automatic template selection based on business type
- 🔴 No business starter kits (pre-generated template bundles)
- 🔴 No seamless flow from business creation → Creative Engine with pre-filled templates

---

## 2. What Is Already Implemented

| Area | Status | Description | Key Files |
|------|--------|-------------|-----------|
| **Store/Business creation (backend)** | ✅ Implemented & usable | Basic store creation via `POST /api/stores`. Creates `Business` entity with name, type, slug, description. Supports `creationMethod` field ('manual', 'ai', 'ocr', 'library') but it's not used in logic. | `apps/core/cardbey-core/src/routes/stores.js` (lines 38-124)<br>`apps/core/cardbey-core/prisma/schema.prisma` (Business model, lines 57-84) |
| **Store/Business creation (frontend)** | ✅ Implemented & usable | `WelcomeCreateStore` component shows 4 options, but only "Manual" works. Calls `createStore()` service which uses `@cardbey/api-client`. | `apps/dashboard/cardbey-marketing-dashboard/src/pages/onboarding/WelcomeCreateStore.tsx`<br>`apps/dashboard/cardbey-marketing-dashboard/src/services/store.ts` |
| **OCR → data → store/products** | 🟡 Partially implemented / rough | OCR pipeline exists (`performMenuOcr`, `extractMenu`, `parseMenuWithLLM`) and can extract products from menu images. However: (1) No UI for image upload in business creation flow, (2) OCR is not connected to `/api/ai/store/bootstrap`, (3) The bootstrap endpoint expects pre-extracted `ocrRawText` string. | `apps/core/cardbey-core/src/modules/menu/performMenuOcr.ts`<br>`apps/core/cardbey-core/src/engines/menu/extractMenu.js`<br>`apps/core/cardbey-core/src/modules/menu/llmMenuParser.ts`<br>`apps/core/cardbey-core/src/routes/ai.js` (bootstrap endpoint, lines 946-1065) |
| **Template system (definitions & engine)** | ✅ Implemented & usable | CreativeTemplate model exists with fields, slots, aiContext. Templates can be instantiated into Content records. Template metadata includes channels, role, primaryIntent, orientation, tags. | `apps/core/cardbey-core/prisma/schema.prisma` (CreativeTemplate model)<br>`apps/core/cardbey-core/src/services/miOrchestratorService.ts` (instantiateCreativeTemplateForContext, lines 417-687)<br>`apps/core/cardbey-core/docs/TEMPLATE_INSTANTIATION_IMPLEMENTATION.md` |
| **Template → Creative Engine instantiation** | ✅ Implemented & usable | `POST /api/mi/orchestrator/templates/:templateId/instantiate` creates new Content from template. Supports `autoFillText` flag for AI text generation. Returns content with slotValues and businessContextSummary. | `apps/core/cardbey-core/src/routes/miRoutes.js` (lines 204-272)<br>`apps/core/cardbey-core/src/services/miOrchestratorService.ts` (lines 417-687) |
| **Business-aware templates (binding to store data)** | 🟡 Partially implemented / rough | Template slots can use `sourceKey` paths (e.g., `business.name`, `business.primaryColor`) to auto-fill from business context. `getBusinessContext()` and `buildSlotValues()` exist. **However**: Business model doesn't have `primaryColor`/`secondaryColor` fields yet (commented as "Future" in code). | `apps/core/cardbey-core/src/services/templateContextHelpers.ts`<br>`apps/core/cardbey-core/src/services/miOrchestratorService.ts` (lines 471-556)<br>`apps/core/cardbey-core/docs/template-engine-v1.md` (line 417: TODO for primaryColor) |
| **Any starter kits or presets** | 🔴 Not implemented / placeholder | There is a `cardbey-starter-library.json` file with template definitions (bakery, cafe, salon), but it's not integrated into the business creation flow. The `/api/ai/store/bootstrap` template mode uses hardcoded mock data, not this library. | `apps/dashboard/cardbey-marketing-dashboard/src/data/cardbey-starter-library.json`<br>`apps/core/cardbey-core/src/routes/ai.js` (loadTemplateData function, lines 885-920) |
| **AI copy/branding generation** | 🟡 Partially implemented / rough | AI text generation exists for template slots (`generateTextForSlot`), but there is **no AI service** to generate: (1) Business taglines/slogans, (2) Brand colors from business description, (3) Hero text, (4) Business style preferences. The `aiService.js` has `generateText()`, `generatePalette()`, `generateDesignLayout()` but they're not used in business creation. | `apps/core/cardbey-core/src/services/templateAITextService.ts`<br>`apps/core/cardbey-core/src/services/aiService.js` (lines 122-492) |
| **Onboarding / wizard UI** | 🟡 Partially implemented / rough | `WelcomeCreateStore` component exists and shows 4 options, but 3 are marked "Coming Soon". The `CreateStoreWithAI` modal exists but is not used in the onboarding flow. Dashboard checks `hasStore` and shows onboarding if false. | `apps/dashboard/cardbey-marketing-dashboard/src/pages/onboarding/WelcomeCreateStore.tsx`<br>`apps/dashboard/cardbey-marketing-dashboard/src/components/dashboard/CreateStoreWithAI.tsx`<br>`apps/dashboard/cardbey-marketing-dashboard/src/pages/DashboardEnhanced.jsx` (lines 1358-1414) |
| **Business Profile object** | 🔴 Not implemented / placeholder | No unified `BusinessProfile` type exists. There is a `StoreProfileData` interface in orchestrator types, but it's only used for memory/context, not as a first-class entity. Business model lacks: primaryColor, secondaryColor, tagline, heroText, stylePreferences. | `apps/core/cardbey-core/src/orchestrator/types.ts` (StoreProfileData, lines 57-66)<br>`apps/core/cardbey-core/src/orchestrator/memory/storeProfileMemory.ts` |
| **Smart template picker (business-aware)** | 🔴 Not implemented / placeholder | `SmartTemplatePicker` and `TemplateCategorySlider` can filter by channel/role/intent, but they don't: (1) Filter by business type/category, (2) Suggest templates based on business industry, (3) Show "recommended for coffee shops" type messaging. | `apps/dashboard/cardbey-marketing-dashboard/src/components/creative-engine/SmartTemplatePicker.tsx`<br>`apps/dashboard/cardbey-marketing-dashboard/src/components/templates/TemplateCategorySlider.tsx`<br>`apps/core/cardbey-core/src/services/miOrchestratorService.ts` (getTemplateSuggestionsForContext, lines 192-401) |

---

## 3. Gaps / What's Left To Do

### Backend

#### **[Backend] Business Profile Generation Service** (Large)
- **What's missing**: A service that generates a complete `BusinessProfile` object from:
  - OCR text (menu/price list)
  - Business description (1-2 sentences)
  - Template key (business type)
- **Should generate**:
  - Business name (if not provided)
  - Business category/type (coffee shop, salon, bakery, etc.)
  - Brand colors (primaryColor, secondaryColor) - 2-4 colors
  - Taglines/slogans (2-3 options)
  - Hero text / short description
  - Style preferences (modern, warm, minimal, etc.)
- **Why it matters**: This is the core "AI business builder" feature. Without it, users can't get a complete business profile automatically.
- **Files to touch**:
  - `apps/core/cardbey-core/src/services/businessProfileService.ts` (new)
  - `apps/core/cardbey-core/src/routes/ai.js` (enhance bootstrap endpoint)

#### **[Backend] Extend Business Model with Brand Fields** (Medium)
- **What's missing**: Add fields to `Business` model:
  - `primaryColor: String?`
  - `secondaryColor: String?`
  - `tagline: String?`
  - `heroText: String?`
  - `stylePreferences: Json?` (e.g., `{ style: "modern", mood: "warm" }`)
- **Why it matters**: Templates expect `business.primaryColor` via `sourceKey`, but the field doesn't exist yet.
- **Files to touch**:
  - `apps/core/cardbey-core/prisma/schema.prisma` (Business model)
  - `apps/core/cardbey-core/src/services/templateContextHelpers.ts` (update getBusinessContext)

#### **[Backend] Connect OCR to Business Creation** (Medium)
- **What's missing**: The `/api/ai/store/bootstrap` endpoint expects `ocrRawText` string, but there's no endpoint to upload an image and get OCR text. Need to:
  - Add image upload endpoint (or reuse existing menu OCR endpoint)
  - Connect image upload → OCR → business bootstrap in one flow
- **Why it matters**: Users should be able to upload a menu image directly, not paste text.
- **Files to touch**:
  - `apps/core/cardbey-core/src/routes/ai.js` (add image upload handler)
  - `apps/core/cardbey-core/src/routes/menuRoutes.js` (reuse OCR logic)

#### **[Backend] Business Starter Kit Generation** (Large)
- **What's missing**: After creating a business, automatically:
  - Select 3-5 relevant templates based on business type
  - Instantiate them with business data
  - Return template IDs/content IDs to frontend
- **Why it matters**: Users should land in Creative Engine with pre-generated templates ready to edit.
- **Files to touch**:
  - `apps/core/cardbey-core/src/services/businessStarterKitService.ts` (new)
  - `apps/core/cardbey-core/src/routes/ai.js` (enhance bootstrap response)

#### **[Backend] Template Metadata for Business Types** (Small)
- **What's missing**: CreativeTemplate model should have a `businessTypes: String[]` field (or use tags) to mark templates as suitable for "coffee-shop", "salon", "bakery", etc.
- **Why it matters**: Enables filtering templates by business type in the picker.
- **Files to touch**:
  - `apps/core/cardbey-core/prisma/schema.prisma` (CreativeTemplate model)
  - `apps/core/cardbey-core/src/services/miOrchestratorService.ts` (update scoring logic)

### Frontend (Dashboard/Marketing/Performer)

#### **[Frontend] Business Creation Wizard with Image Upload** (Large)
- **What's missing**: Replace the "Coming Soon" options in `WelcomeCreateStore` with a real wizard that:
  - Step 1: Choose method (OCR, AI Description, Template)
  - Step 2: Upload image (for OCR) OR enter description OR select template
  - Step 3: Show generated business profile (name, colors, taglines) for review
  - Step 4: Confirm and create
- **Why it matters**: This is the primary user entry point. Currently broken.
- **Files to touch**:
  - `apps/dashboard/cardbey-marketing-dashboard/src/pages/onboarding/WelcomeCreateStore.tsx` (major rewrite)
  - `apps/dashboard/cardbey-marketing-dashboard/src/components/dashboard/CreateStoreWithAI.tsx` (enhance or replace)

#### **[Frontend] Business Profile Preview Component** (Medium)
- **What's missing**: A component to display and edit the generated business profile (name, colors, taglines, description) before creating the store.
- **Why it matters**: Users should review and adjust AI-generated content before committing.
- **Files to touch**:
  - `apps/dashboard/cardbey-marketing-dashboard/src/components/business/BusinessProfilePreview.tsx` (new)

#### **[Frontend] Redirect to Creative Engine with Starter Kit** (Small)
- **What's missing**: After business creation, redirect to Creative Engine with the starter kit templates already loaded.
- **Why it matters**: Seamless flow from creation → editing templates.
- **Files to touch**:
  - `apps/dashboard/cardbey-marketing-dashboard/src/pages/onboarding/WelcomeCreateStore.tsx` (update onSuccess handler)
  - `apps/dashboard/cardbey-marketing-dashboard/src/pages/CreativeEngineShellPage.tsx` (handle starter kit query param)

#### **[Frontend] Business-Aware Template Picker** (Medium)
- **What's missing**: Update `SmartTemplatePicker` and `TemplateCategorySlider` to:
  - Accept `businessType` prop
  - Filter/sort templates by business type match
  - Show "Recommended for [business type]" badges
- **Why it matters**: Better template discovery for users.
- **Files to touch**:
  - `apps/dashboard/cardbey-marketing-dashboard/src/components/creative-engine/SmartTemplatePicker.tsx`
  - `apps/dashboard/cardbey-marketing-dashboard/src/components/templates/TemplateCategorySlider.tsx`
  - `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` (update getMITemplateSuggestions call)

### Creative Engine / Templates

#### **[Templates] Business Type Metadata** (Small)
- **What's missing**: Existing templates need `businessTypes` tags added (e.g., `["coffee-shop", "cafe"]` for cafe templates).
- **Why it matters**: Enables business-aware filtering.
- **Files to touch**:
  - Database migration or seed script to update existing CreativeTemplate records

#### **[Templates] Starter Kit Template Definitions** (Medium)
- **What's missing**: Define "starter kits" as collections of 3-5 templates per business type (e.g., "Coffee Shop Starter Kit" = menu board + promo poster + social post).
- **Why it matters**: Provides curated template bundles for new businesses.
- **Files to touch**:
  - `apps/core/cardbey-core/src/services/businessStarterKitService.ts` (define kit configs)
  - Or add `starterKitId` field to CreativeTemplate model

### AI Orchestration

#### **[AI] Real Product Generation from Description** (Medium)
- **What's missing**: Replace mock `generateProductsFromDescription()` with real AI that:
  - Analyzes business description
  - Infers business type
  - Generates realistic product list with prices
  - Suggests categories
- **Why it matters**: Currently returns 3 generic products. Should be intelligent.
- **Files to touch**:
  - `apps/core/cardbey-core/src/routes/ai.js` (generateProductsFromDescription function, lines 836-879)

#### **[AI] Brand Color Generation from Business Context** (Small)
- **What's missing**: Use existing `generatePalette()` from `aiService.js` to generate brand colors from business description/type.
- **Why it matters**: Auto-generate brand colors for the business profile.
- **Files to touch**:
  - `apps/core/cardbey-core/src/services/businessProfileService.ts` (call generatePalette)

#### **[AI] Tagline/Slogan Generation** (Small)
- **What's missing**: Use existing `generateText()` from `aiService.js` to generate 2-3 tagline options from business description.
- **Why it matters**: Auto-generate taglines for the business profile.
- **Files to touch**:
  - `apps/core/cardbey-core/src/services/businessProfileService.ts` (call generateText with section='tagline')

---

## 4. Recommended Implementation Order

### Phase 1 — Minimum Viable Business Creation Flow

**Goal**: Allow a user to create a business, generate at least one auto-filled template, and edit it in Creative Engine.

#### Tasks:

1. **Extend Business Model with Brand Fields** (Backend)
   - Add `primaryColor`, `secondaryColor`, `tagline`, `heroText`, `stylePreferences` to Business model
   - Run migration
   - Update `getBusinessContext()` to return these fields
   - **Files**: `apps/core/cardbey-core/prisma/schema.prisma`, `apps/core/cardbey-core/src/services/templateContextHelpers.ts`

2. **Create Business Profile Generation Service** (Backend)
   - New service: `businessProfileService.ts`
   - Function: `generateBusinessProfile(mode, input)` that returns:
     - Business name (infer from description or use provided)
     - Business type/category (infer from description/OCR)
     - Brand colors (call `generatePalette()`)
     - Tagline (call `generateText()` with section='tagline')
     - Hero text (call `generateText()` with section='body')
   - **Files**: `apps/core/cardbey-core/src/services/businessProfileService.ts` (new)

3. **Enhance `/api/ai/store/bootstrap` Endpoint** (Backend)
   - Call `generateBusinessProfile()` before creating store
   - Save generated profile fields to Business entity
   - Return business profile in response
   - **Files**: `apps/core/cardbey-core/src/routes/ai.js` (lines 946-1065)

4. **Connect OCR to Business Creation** (Backend)
   - Add image upload handler to `/api/ai/store/bootstrap` (or separate endpoint)
   - Call `performMenuOcr()` on uploaded image
   - Pass OCR text to existing bootstrap logic
   - **Files**: `apps/core/cardbey-core/src/routes/ai.js`, `apps/core/cardbey-core/src/modules/menu/performMenuOcr.ts`

5. **Update Business Creation Wizard UI** (Frontend)
   - Replace "Coming Soon" with real flows:
     - OCR: Image upload → show extracted text → generate profile → create
     - AI Description: Text input → generate profile → create
     - Template: Template picker → generate profile → create
   - Show business profile preview before creating
   - **Files**: `apps/dashboard/cardbey-marketing-dashboard/src/pages/onboarding/WelcomeCreateStore.tsx`, `apps/dashboard/cardbey-marketing-dashboard/src/components/dashboard/CreateStoreWithAI.tsx`

6. **Auto-Instantiate One Template After Creation** (Backend + Frontend)
   - After store creation, automatically instantiate one "welcome" or "hero" template
   - Return template content ID in bootstrap response
   - Frontend redirects to Creative Engine with that content pre-loaded
   - **Files**: `apps/core/cardbey-core/src/routes/ai.js`, `apps/dashboard/cardbey-marketing-dashboard/src/pages/onboarding/WelcomeCreateStore.tsx`

**Estimated Effort**: 5-7 days

---

### Phase 2 — Starter Kits and Better UX

**Goal**: Generate multiple templates per business, provide starter packs, and improve onboarding.

#### Tasks:

1. **Add Business Type to Template Metadata** (Backend)
   - Add `businessTypes: String[]` field to CreativeTemplate model (or use tags)
   - Seed existing templates with business type tags
   - **Files**: `apps/core/cardbey-core/prisma/schema.prisma`, seed script

2. **Create Business Starter Kit Service** (Backend)
   - Define starter kit configs (e.g., "Coffee Shop Kit" = [menu board, promo poster, social post])
   - Function: `generateStarterKit(businessType, businessId)` that:
     - Selects 3-5 templates based on business type
     - Instantiates them with business data
     - Returns content IDs
   - **Files**: `apps/core/cardbey-core/src/services/businessStarterKitService.ts` (new)

3. **Enhance Bootstrap Endpoint to Return Starter Kit** (Backend)
   - After creating store, call `generateStarterKit()`
   - Return array of instantiated content IDs
   - **Files**: `apps/core/cardbey-core/src/routes/ai.js`

4. **Update Creative Engine to Load Starter Kit** (Frontend)
   - Accept `starterKit` query param with content IDs
   - Pre-load those contents in the editor
   - Show "Your Starter Kit" section in template picker
   - **Files**: `apps/dashboard/cardbey-marketing-dashboard/src/pages/CreativeEngineShellPage.tsx`

5. **Business-Aware Template Picker** (Frontend)
   - Update `SmartTemplatePicker` to accept `businessType`
   - Filter/sort templates by business type match
   - Show "Recommended for [type]" badges
   - **Files**: `apps/dashboard/cardbey-marketing-dashboard/src/components/creative-engine/SmartTemplatePicker.tsx`, `apps/core/cardbey-core/src/services/miOrchestratorService.ts` (scoring logic)

6. **Improve Real Product Generation** (Backend)
   - Replace mock `generateProductsFromDescription()` with real AI
   - Use LLM to analyze description and generate realistic products
   - **Files**: `apps/core/cardbey-core/src/routes/ai.js` (lines 836-879)

**Estimated Effort**: 4-6 days

---

### Phase 3 — Advanced AI Business Builder

**Goal**: "Describe your business" → full AI-generated kit with deeper integration.

#### Tasks:

1. **Enhanced Business Profile Generation** (Backend)
   - Generate multiple tagline options (2-3)
   - Generate style preferences (modern, warm, minimal, etc.)
   - Infer business category more accurately
   - **Files**: `apps/core/cardbey-core/src/services/businessProfileService.ts`

2. **Template Recommendations Based on Profile** (Backend)
   - Use business profile (colors, style, type) to score templates
   - Recommend templates that match brand colors
   - **Files**: `apps/core/cardbey-core/src/services/miOrchestratorService.ts` (enhance scoring)

3. **Multi-Template Generation from Description** (Backend)
   - User describes business → AI generates multiple template proposals
   - User selects proposals → system creates templates
   - **Files**: `apps/core/cardbey-core/src/services/templateAIProposalService.ts` (already exists, integrate into flow)

4. **Campaign Integration** (Backend + Frontend)
   - After business creation, suggest creating first campaign
   - Pre-fill campaign with starter kit templates
   - **Files**: Campaign creation flow (future)

5. **C-Net / Device Integration** (Backend + Frontend)
   - After business creation, suggest connecting devices
   - Pre-configure playlists with starter kit content
   - **Files**: Device management flow (future)

**Estimated Effort**: 5-7 days

---

## 5. Risks, Tech Debt, and Quick Wins

### Risks

1. **OCR Accuracy**: The OCR pipeline exists but may need tuning for different menu formats. Consider adding a "review extracted items" step before creating products.

2. **AI Cost**: Generating business profiles, colors, taglines, and products will make multiple AI API calls. Consider:
   - Caching generated profiles
   - Using cheaper models (gpt-4o-mini) for non-critical generations
   - Rate limiting

3. **Template Quality**: Starter kits depend on having good templates for each business type. May need to create/curate templates before launching.

4. **Business Model Migration**: Adding new fields to Business model requires migration. Ensure backward compatibility (nullable fields).

### Tech Debt

1. **Mock Data in Bootstrap**: The `/api/ai/store/bootstrap` endpoint uses hardcoded mock templates (`loadTemplateData`) and mock product generation (`generateProductsFromDescription`). These need to be replaced with real implementations.

2. **Incomplete Template Context**: `getBusinessContext()` has a TODO comment for `primaryColor`/`secondaryColor`. Templates expect these fields but they don't exist yet.

3. **Unused Components**: `CreateStoreWithAI` component exists but is not used in the onboarding flow. Either integrate it or remove it.

4. **Starter Library Not Integrated**: `cardbey-starter-library.json` exists but is not used. Either integrate it or remove it.

5. **StoreProfileData vs Business**: There are two concepts: `StoreProfileData` (orchestrator memory) and `Business` (database entity). Consider consolidating or clarifying the relationship.

### Quick Wins

1. **Enable OCR Mode in Onboarding** (Small, High Impact)
   - Connect existing OCR pipeline to `CreateStoreWithAI` component
   - Add image upload UI
   - **Files**: `apps/dashboard/cardbey-marketing-dashboard/src/components/dashboard/CreateStoreWithAI.tsx`, `apps/core/cardbey-core/src/routes/ai.js`

2. **Add Business Type to Business Model** (Small, High Impact)
   - Currently `type: 'General'` is hardcoded
   - Infer type from description/OCR (coffee shop, salon, etc.)
   - Use this for template filtering
   - **Files**: `apps/core/cardbey-core/src/routes/ai.js` (bootstrap endpoint), `apps/core/cardbey-core/src/services/businessProfileService.ts`

3. **Show Generated Business Profile Before Creating** (Small, High Impact)
   - After generating profile, show preview with editable fields
   - User can adjust colors, taglines before committing
   - **Files**: `apps/dashboard/cardbey-marketing-dashboard/src/components/business/BusinessProfilePreview.tsx` (new)

4. **Auto-Instantiate Welcome Template** (Small, High Impact)
   - After store creation, automatically create one "Welcome" template
   - Redirect to Creative Engine with it open
   - **Files**: `apps/core/cardbey-core/src/routes/ai.js`, `apps/dashboard/cardbey-marketing-dashboard/src/pages/onboarding/WelcomeCreateStore.tsx`

5. **Add Business Type Filter to Template Picker** (Small, Medium Impact)
   - Update `getTemplateSuggestionsForContext()` to accept `businessType`
   - Boost score for templates matching business type
   - **Files**: `apps/core/cardbey-core/src/services/miOrchestratorService.ts` (lines 192-401)

---

## 6. Implementation Readiness

### If you want, I can now start implementing Phase 1 tasks. Suggested starting tasks:

1. **Extend Business Model with Brand Fields**
   - File: `apps/core/cardbey-core/prisma/schema.prisma`
   - Add: `primaryColor`, `secondaryColor`, `tagline`, `heroText`, `stylePreferences`
   - Run migration

2. **Create Business Profile Generation Service**
   - File: `apps/core/cardbey-core/src/services/businessProfileService.ts` (new)
   - Implement: `generateBusinessProfile(mode, input)` that calls AI services

3. **Update Template Context Helpers**
   - File: `apps/core/cardbey-core/src/services/templateContextHelpers.ts`
   - Update `getBusinessContext()` to return new brand fields

4. **Enhance Bootstrap Endpoint**
   - File: `apps/core/cardbey-core/src/routes/ai.js`
   - Call `generateBusinessProfile()` and save to Business entity

5. **Add Image Upload to Bootstrap**
   - File: `apps/core/cardbey-core/src/routes/ai.js`
   - Add multer/file upload handler
   - Call `performMenuOcr()` on uploaded image

---

**End of Report**

