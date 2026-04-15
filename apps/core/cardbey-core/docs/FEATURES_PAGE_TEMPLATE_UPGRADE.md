# Features Page Template Upgrade - Implementation Summary

## Overview

Upgraded the Features page and template UX across Cardbey to showcase live template categories with AI-powered proposals and instant template generation.

---

## Backend Implementation ✅

### 1. Extended Template Suggestions Endpoint

**File:** `apps/core/cardbey-core/src/services/miOrchestratorService.ts`

**Changes:**
- Added `query?: string` parameter to `GetTemplateSuggestionsParams`
- Implemented text-based filtering (name/description/tags matching)
- Added AI proposal generation when query exists and results are empty/low-confidence
- Returns `{ templates, aiProposals?, debug }`

**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

**Changes:**
- Updated `GET /api/mi/orchestrator/templates/suggestions` to accept `query` parameter
- Response now includes `aiProposals` array when available

**Example Request:**
```
GET /api/mi/orchestrator/templates/suggestions?query=coffee%20poster&channel=cnet_screen&tenantId=xxx
```

**Example Response:**
```json
{
  "ok": true,
  "templates": [
    {
      "id": "...",
      "name": "Coffee Shop Poster",
      "score": 45,
      ...
    }
  ],
  "aiProposals": [
    {
      "id": "proposal_1234567890_abc123",
      "name": "Artisan Coffee Promo",
      "description": "A bold poster template for coffee shop promotions",
      "suggestedKind": "GRAPHIC",
      "suggestedChannel": "cnet_screen",
      "suggestedOrientation": "vertical",
      "tags": ["coffee", "promo", "poster"],
      "fields": {
        "slots": [
          {
            "id": "headline",
            "label": "Headline",
            "type": "text",
            "defaultValue": "Fresh Coffee Daily"
          }
        ]
      },
      "aiContext": {
        "tone": "warm",
        "audience": "coffee_lovers",
        "language": "en",
        "styleHints": ["rustic", "modern"]
      }
    }
  ]
}
```

---

### 2. AI Proposal Service

**File:** `apps/core/cardbey-core/src/services/templateAIProposalService.ts` (NEW)

**Features:**
- `generateTemplateProposalsFromQuery()` - Generates 1-3 AI proposals from user query
- Uses OpenAI to create template proposals with fields and aiContext
- Returns ephemeral proposals (not saved to DB)
- Includes business context in prompt for better proposals

**Interface:**
```typescript
interface AITemplateProposal {
  id: string; // Ephemeral ID
  name: string;
  description: string;
  suggestedKind: 'GRAPHIC' | 'VIDEO' | 'REPORT' | 'PROCESS';
  suggestedChannel?: string;
  suggestedOrientation?: 'vertical' | 'horizontal' | 'square' | 'any';
  tags?: string[];
  fields: { slots: TemplateSlot[] };
  aiContext: TemplateAIContext;
}
```

---

### 3. Template Generator Service

**File:** `apps/core/cardbey-core/src/services/templateGeneratorService.ts` (NEW)

**Features:**
- `generateTemplateFromProposal()` - Converts AI proposal → real CreativeTemplate
- Creates base Content with layout archetype
- Registers MIEntity
- Instantiates template immediately
- Returns `{ templateId, contentId }` for navigation

**Layout Archetypes:**
- `vertical` → 1080x1920 (9:16)
- `horizontal` → 1920x1080 (16:9)
- `square` → 1080x1080 (1:1)
- Default → 1920x1080

---

### 4. Generate Template Endpoint

**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

**New Endpoint:** `POST /api/mi/orchestrator/templates/generate`

**Request Body:**
```json
{
  "proposal": {
    "id": "proposal_...",
    "name": "Coffee Shop Poster",
    "description": "...",
    "suggestedKind": "GRAPHIC",
    "fields": { "slots": [...] },
    "aiContext": { ... }
  },
  "categoryOverride": "cnet",
  "channel": "cnet_screen",
  "orientation": "vertical",
  "autoFillText": true
}
```

**Response:**
```json
{
  "ok": true,
  "templateId": "cm...",
  "contentId": "cm..." // Ready for Creative Engine
}
```

---

## Frontend Implementation (In Progress)

### 5. Frontend API Functions

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`

**New Functions Needed:**
- `getTemplatesByCategory(config)` - Filter templates by category
- `searchTemplates(query, context)` - Search with query parameter
- `generateTemplateFromProposal(proposal, options)` - Generate template from AI proposal

**Updated Functions:**
- `getMITemplateSuggestions()` - Now supports `query` parameter and returns `aiProposals`

---

### 6. TemplateCategoryBlock Component

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/components/templates/TemplateCategoryBlock.tsx` (NEW)

**Props:**
```typescript
{
  title: string;
  description?: string;
  categoryKey: string;
  fetchConfig: {
    channels?: string[];
    tags?: string[];
    role?: string;
    primaryIntent?: string;
  };
  onTemplateClick: (templateId: string) => void;
}
```

**Features:**
- Fetches up to 4 templates for category
- Displays thumbnails in grid
- "See all templates" button opens category modal
- Clicking thumbnail → instantiate → navigate to Creative Engine

---

### 7. TemplateCategoryModal Component

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/components/templates/TemplateCategoryModal.tsx` (NEW)

**Features:**
- Search bar with debounce
- Template grid (DB results)
- AI proposals section ("Cardbey can create a new template for you")
- "Create this template" button on proposal cards
- Closes modal and navigates to Creative Engine after generation

---

### 8. SmartTemplatePicker Updates

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/components/creative-engine/SmartTemplatePicker.tsx`

**Changes:**
- Add search input at top
- Call `getMITemplateSuggestions({ query, ... })`
- Display results + AI proposals
- Allow generating new template from proposal

---

### 9. FeaturesPage Updates

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx`

**Changes:**
- Add template category section
- Use `TemplateCategoryBlock` for each category:
  - Business Templates
  - Video Templates
  - Social Templates
  - C-Net Screen Templates
  - Content Studio Templates
  - Analytics / Report Templates

---

## Template Categories Configuration

```typescript
const TEMPLATE_CATEGORIES = [
  {
    key: 'business',
    title: 'Business Templates',
    description: 'Professional templates for your business',
    fetchConfig: {
      tags: ['business', 'professional'],
      role: 'generic',
    },
  },
  {
    key: 'video',
    title: 'Video Templates',
    description: 'Dynamic video content templates',
    fetchConfig: {
      tags: ['video'],
      role: 'generic',
    },
  },
  {
    key: 'social',
    title: 'Social Templates',
    description: 'Templates for social media',
    fetchConfig: {
      channels: ['social'],
    },
  },
  {
    key: 'cnet',
    title: 'C-Net Screen Templates',
    description: 'Digital signage templates',
    fetchConfig: {
      channels: ['cnet_screen'],
    },
  },
  {
    key: 'studio',
    title: 'Content Studio Templates',
    description: 'Creative design templates',
    fetchConfig: {
      tags: ['studio', 'creative'],
    },
  },
  {
    key: 'analytics',
    title: 'Analytics / Report Templates',
    description: 'Data visualization templates',
    fetchConfig: {
      tags: ['analytics', 'report'],
      role: 'generic',
    },
  },
];
```

---

## Navigation Flow

### Template Click Flow:
1. User clicks template thumbnail
2. Call `instantiateCreativeTemplate(templateId, { autoFillText: true })`
3. Navigate to `/app/contents-studio?id=${contentId}`

### AI Proposal Flow:
1. User searches → sees AI proposals
2. User clicks "Create this template"
3. Call `generateTemplateFromProposal(proposal, { ... })`
4. Receive `{ templateId, contentId }`
5. Navigate to `/app/contents-studio?id=${contentId}`

---

## Example UI States

### Search Empty:
- Shows all templates in category
- No AI proposals shown

### Search with Results:
- Shows matching templates (sorted by score)
- If low confidence → shows AI proposals below

### Search with No Results:
- Shows "No templates found" message
- Shows AI proposals section prominently

### AI Proposals:
- Card layout with proposal name, description, tags
- "Create this template" button
- Loading state during generation

---

## TODO / Enhancement Notes

1. **Thumbnail Generation**: Generate preview thumbnails for AI-generated templates
2. **Template Preview**: Add preview modal before instantiation
3. **Template Favorites**: Allow users to favorite templates
4. **Template Sharing**: Share templates between tenants/stores
5. **Template Analytics**: Track which templates are used most
6. **Layout Refinement**: Improve layout archetypes based on user feedback
7. **Multi-language Support**: Generate proposals in user's language
8. **Template Variants**: Allow AI to generate multiple variants of same template

---

## Testing Checklist

- [ ] Search templates by query
- [ ] AI proposals appear when no/low results
- [ ] Generate template from proposal
- [ ] Template instantiation works
- [ ] Navigation to Creative Engine works
- [ ] Category blocks display correctly
- [ ] Modal search and filtering works
- [ ] SmartTemplatePicker search works
- [ ] Error handling for failed generations

---

## Files Modified

### Backend:
- ✅ `apps/core/cardbey-core/src/services/miOrchestratorService.ts`
- ✅ `apps/core/cardbey-core/src/services/templateAIProposalService.ts` (NEW)
- ✅ `apps/core/cardbey-core/src/services/templateGeneratorService.ts` (NEW)
- ✅ `apps/core/cardbey-core/src/routes/miRoutes.js`

### Frontend (Pending):
- ⏳ `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`
- ⏳ `apps/dashboard/cardbey-marketing-dashboard/src/components/templates/TemplateCategoryBlock.tsx` (NEW)
- ⏳ `apps/dashboard/cardbey-marketing-dashboard/src/components/templates/TemplateCategoryModal.tsx` (NEW)
- ⏳ `apps/dashboard/cardbey-marketing-dashboard/src/components/creative-engine/SmartTemplatePicker.tsx`
- ⏳ `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx`

