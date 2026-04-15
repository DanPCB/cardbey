# Template Engine v1 - Creative Engine

## Overview

Template Engine v1 provides a foundation for reusable design templates in the Creative Engine, with support for:
- **Template Slots**: Placeholder fields that can be auto-filled from business/store context
- **AI Context**: Metadata for AI-powered content generation (tone, audience, style)
- **Context Merging**: Automatic injection of business data (name, logo, colors) when templates are instantiated

This system is designed to be extensible for future template types (Video, Report, Process) while maintaining a clean, generic foundation.

---

## Architecture

### CreativeTemplate Model

The `CreativeTemplate` Prisma model has been extended with:

```prisma
model CreativeTemplate {
  // ... existing fields ...
  fields    Json?    // TemplateSlot[] array
  aiContext Json?    // TemplateAIContext object
}
```

### Shared Types

Located in `packages/template-engine/src/templateTypes.ts`:

- **`TemplateSlot`**: Defines a placeholder with `id`, `label`, `type`, `sourceKey` for auto-fill, `defaultValue`
- **`TemplateAIContext`**: Contains `tone`, `audience`, `language`, `styleHints` for AI generation
- **`CreativeTemplateFields`**: Wrapper structure for CreativeTemplate-specific fields

These types are generic and can be reused by future `VideoTemplate`, `ReportTemplate`, etc.

---

## Template Slot Types

Supported slot types:
- `text` - Plain text
- `richtext` - Rich text with formatting
- `image` - Image URL
- `video` - Video URL
- `color` - Color hex code
- `date` - Date value
- `number` - Numeric value

---

## Example Templates

### 1. Grand Opening Invitation

**Fields:**
```json
{
  "slots": [
    {
      "id": "business_name",
      "label": "Business Name",
      "type": "text",
      "required": true,
      "sourceKey": "business.name",
      "description": "The name of your business"
    },
    {
      "id": "event_date",
      "label": "Event Date",
      "type": "date",
      "required": true,
      "description": "Date of the grand opening event"
    },
    {
      "id": "event_time",
      "label": "Event Time",
      "type": "text",
      "required": false,
      "defaultValue": "10:00 AM",
      "description": "Time of the event"
    },
    {
      "id": "business_logo",
      "label": "Business Logo",
      "type": "image",
      "required": false,
      "sourceKey": "business.logoUrl",
      "description": "Your business logo"
    }
  ]
}
```

**AI Context:**
```json
{
  "tone": "friendly",
  "audience": "new_customers",
  "language": "en",
  "styleHints": ["welcoming", "celebratory", "modern"]
}
```

### 2. 50% OFF Promo Poster

**Fields:**
```json
{
  "slots": [
    {
      "id": "business_name",
      "label": "Business Name",
      "type": "text",
      "required": true,
      "sourceKey": "business.name"
    },
    {
      "id": "discount_text",
      "label": "Discount Text",
      "type": "text",
      "required": true,
      "defaultValue": "50% OFF"
    },
    {
      "id": "promo_title",
      "label": "Promo Title",
      "type": "text",
      "required": false,
      "defaultValue": "Special Offer"
    },
    {
      "id": "promo_description",
      "label": "Promo Description",
      "type": "richtext",
      "required": false,
      "defaultValue": "Limited time offer!"
    },
    {
      "id": "business_logo",
      "label": "Business Logo",
      "type": "image",
      "required": false,
      "sourceKey": "business.logoUrl"
    },
    {
      "id": "primary_color",
      "label": "Primary Brand Color",
      "type": "color",
      "required": false,
      "defaultValue": "#FF6B6B"
    }
  ]
}
```

**AI Context:**
```json
{
  "tone": "energetic",
  "audience": "general",
  "language": "en",
  "styleHints": ["bold", "attention-grabbing", "modern"]
}
```

---

## Context Merging Flow

When `instantiateCreativeTemplateForContext()` is called:

1. **Load Template**: Fetch `CreativeTemplate` by ID
2. **Parse Fields**: Extract `fields.slots` array (TemplateSlot[])
3. **Get Business Context**: Query `Business` model by `storeId` to get:
   - `name`
   - `description`
   - `logo.url` (parsed from JSON)
   - `address`
   - `phone`
4. **Resolve Slot Values**: For each slot:
   - If `sourceKey` exists (e.g., `"business.name"`), resolve from business context
   - Otherwise, use `defaultValue` if available
5. **Store Slot Values**: Save resolved values in `content.settings.meta.templateSlots`
6. **Return Metadata**: Response includes `slotValues` and `businessContextSummary`

**Pseudo-code:**
```typescript
// 1. Parse template fields
const slots = template.fields?.slots || [];

// 2. Get business context
const businessContext = await getBusinessContext(storeId);
// Returns: { business: { id, name, logoUrl, address, phone } }

// 3. Build slot values
const slotValues = buildSlotValues(slots, businessContext);
// Resolves sourceKey paths like "business.name" → businessContext.business.name

// 4. Store in content
content.settings.meta = {
  templateSlots: slotValues,
  templateId: template.id,
};

// 5. Return extended response
return {
  content: newContent,
  templateId: template.id,
  slotValues,
  businessContextSummary: { id: business.id, name: business.name },
};
```

---

## Source Key Paths

Supported dot-notation paths for `sourceKey`:

- `business.name` → Business.name
- `business.description` → Business.description
- `business.logoUrl` → Business.logo.url (parsed from JSON)
- `business.address` → Business.address
- `business.phone` → Business.phone

Future extensions can add:
- `campaign.name`
- `product.name`
- `customer.name`

---

## Future Extensions

### Video Templates

Future `VideoTemplate` model can reuse the same slot types and AI context:

```typescript
// Reuse shared types
import { TemplateSlot, TemplateAIContext } from '@cardbey/template-engine';

interface VideoTemplateFields {
  slots?: TemplateSlot[];      // Same slot structure
  aiContext?: TemplateAIContext; // Same AI context
  // Video-specific: duration, aspectRatio, etc.
}
```

### Report Templates

Similarly, `ReportTemplate` can reuse:

```typescript
interface ReportTemplateFields {
  slots?: TemplateSlot[];      // Reuse slots
  aiContext?: TemplateAIContext; // Reuse AI context
  // Report-specific: dataSource, chartTypes, etc.
}
```

### Process Templates

Workflow/process templates can also leverage the same foundation:

```typescript
interface ProcessTemplateFields {
  slots?: TemplateSlot[];      // Reuse slots
  aiContext?: TemplateAIContext; // Reuse AI context
  // Process-specific: steps, triggers, etc.
}
```

---

## API Endpoints

### Create Template

```http
POST /api/creative-templates
Content-Type: application/json

{
  "name": "Grand Opening Invitation",
  "description": "...",
  "fields": {
    "slots": [
      {
        "id": "business_name",
        "label": "Business Name",
        "type": "text",
        "sourceKey": "business.name"
      }
    ]
  },
  "aiContext": {
    "tone": "friendly",
    "audience": "new_customers"
  }
}
```

### Instantiate Template

```http
POST /api/mi/orchestrator/templates/:templateId/instantiate
Content-Type: application/json

{
  "channel": "cnet_screen",
  "orientation": "vertical"
}
```

**Response:**
```json
{
  "ok": true,
  "content": { ... },
  "templateId": "tmpl_123",
  "slotValues": {
    "business_name": "My Store",
    "business_logo": "https://..."
  },
  "businessContextSummary": {
    "id": "store_456",
    "name": "My Store"
  }
}
```

---

## Canvas Node → Template Slot Mapping

### Convention

For template-backed content, text nodes that should be auto-filled from template slots must have:

```typescript
node.meta = {
  templateSlotId: "business_name" // Matches TemplateSlot.id
};
```

When a template is instantiated:
1. Backend resolves `slotValues` from business context + AI (if `autoFillText: true`)
2. Slot values are stored in `content.settings.meta.templateSlots`
3. Frontend applies slot values to nodes when loading content:
   - Checks if `settings.meta.templateId` exists (indicates template-backed content)
   - For each text node with `node.meta.templateSlotId`, applies `slotValues[templateSlotId]` to `node.text`

### Example

**Template Slot Definition:**
```json
{
  "id": "headline",
  "label": "Headline",
  "type": "text",
  "sourceKey": "business.name"
}
```

**Canvas Node (in baseContent):**
```json
{
  "id": "text_1",
  "kind": "text",
  "text": "{{headline}}", // Placeholder text (optional)
  "meta": {
    "templateSlotId": "headline"
  }
}
```

**After Instantiation:**
- `slotValues.headline = "My Store"` (from business context or AI)
- Node is updated: `node.text = "My Store"`

## AI Text Filling

When `autoFillText: true` is passed to the instantiation API:

1. **Resolve from sourceKey first** (e.g., `business.name` → "My Store")
2. **Use defaultValue if available** (e.g., `"50% OFF"`)
3. **For empty text/richtext slots**: Call AI to generate text using:
   - Slot label and description
   - AI context (tone, audience, styleHints)
   - Business context (name, description, address, phone)
   - Language preference

**AI Prompt Structure:**
- System: Professional copywriter with tone/audience/style guidance
- User: Slot details + business context + language
- Returns: Concise, engaging text (1-2 sentences max)

**Error Handling:**
- AI failures don't block template instantiation
- Falls back to empty string or defaultValue if AI generation fails

## TODOs / Follow-ups

### Immediate

- [x] Wire `slotValues` into canvas state in ContentsStudio ✅
- [x] Update frontend API types to include `slotValues` and `businessContextSummary` ✅
- [x] AI text generation using `aiContext` (tone, audience) to fill text slots ✅
- [ ] Add UI in SmartTemplatePicker to preview slot values before instantiation
- [ ] Add UI toggle for "AI auto-fill" in SmartTemplatePicker (currently hardcoded to `true`)

### Future

- [ ] Extend Business model with `primaryColor` and `secondaryColor` for brand palette
- [ ] Support nested sourceKey paths (e.g., `campaign.product.name`)
- [ ] Template preview/thumbnail generation from slot values
- [ ] Template versioning (when template fields change, handle existing instantiations)
- [ ] Batch AI text generation for multiple language versions
- [ ] AI-generated image suggestions for image slots

### Unified Template Engine

- [ ] Create `VideoTemplate` model reusing `TemplateSlot[]` and `TemplateAIContext`
- [ ] Create `ReportTemplate` model for analytics/reporting templates
- [ ] Create `ProcessTemplate` model for workflow templates
- [ ] Shared template registry/API that works across all template types

---

## Files Modified

- `apps/core/cardbey-core/prisma/schema.prisma` - Added `fields` and `aiContext` to CreativeTemplate
- `apps/core/cardbey-core/src/routes/creativeTemplates.js` - Updated CRUD to handle fields + aiContext
- `apps/core/cardbey-core/src/services/miOrchestratorService.ts` - Added context merging logic
- `apps/core/cardbey-core/src/services/templateContextHelpers.ts` - New helper functions
- `apps/core/cardbey-core/scripts/seedDevTemplates.ts` - Updated with example templates
- `packages/template-engine/` - New shared package with types

---

## Migration

Run the Prisma migration:

```bash
cd apps/core/cardbey-core
npx prisma migrate dev --name add_creative_template_fields
npx prisma generate
```

Then seed example templates:

```bash
npx tsx scripts/seedDevTemplates.ts
```

