# Template Engine v1 - Implementation Summary

## Summary of Changes

### Files Created

1. **`packages/template-engine/src/templateTypes.ts`**
   - Shared TypeScript types: `TemplateSlot`, `TemplateAIContext`, `CreativeTemplateFields`
   - Generic, extensible types for future template types (Video, Report, Process)

2. **`packages/template-engine/src/index.ts`**
   - Package entry point exporting shared types

3. **`packages/template-engine/package.json`** & **`tsconfig.json`**
   - Package configuration for shared template types

4. **`apps/core/cardbey-core/src/services/templateContextHelpers.ts`**
   - `getBusinessContext()` - Fetches business data by storeId
   - `getByPath()` - Resolves dot-notation paths (e.g., "business.name")
   - `buildSlotValues()` - Resolves slot values from business context

5. **`apps/core/cardbey-core/docs/template-engine-v1.md`**
   - Complete documentation with examples, architecture, and future extensions

### Files Modified

1. **`apps/core/cardbey-core/prisma/schema.prisma`**
   - Added `fields Json?` to CreativeTemplate (stores TemplateSlot[] array)
   - Added `aiContext Json?` to CreativeTemplate (stores TemplateAIContext object)
   - Added code comments explaining future extensibility

2. **`apps/core/cardbey-core/src/routes/creativeTemplates.js`**
   - `POST /api/creative-templates`: Accepts `fields` and `aiContext` in request body
   - `PUT /api/creative-templates/:id`: Allows updating `fields` and `aiContext`
   - `GET /api/creative-templates`: Returns parsed `fields` and `aiContext` in response
   - Added validation for fields (must be array) and aiContext (must be object)

3. **`apps/core/cardbey-core/src/services/miOrchestratorService.ts`**
   - `instantiateCreativeTemplateForContext()`: Extended to:
     - Parse template `fields.slots` array
     - Fetch business context via `getBusinessContext(storeId)`
     - Resolve slot values using `buildSlotValues()`
     - Store slot values in `content.settings.meta.templateSlots`
     - Return extended response: `{ content, templateId, slotValues, businessContextSummary }`

4. **`apps/core/cardbey-core/scripts/seedDevTemplates.ts`**
   - Updated template 1: "Grand Opening Invitation" with 4 slots and AI context
   - Updated template 2: "50% OFF Promo Poster" with 6 slots and AI context
   - Removed generic template 3 (kept only 2 examples with full field definitions)

---

## Example CreativeTemplate.fields JSON

**Grand Opening Invitation Template:**

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

See `apps/core/cardbey-core/scripts/seedDevTemplates.ts` for the complete example with AI context.

---

## Context Merging Flow (Pseudo-code)

```typescript
async function instantiateCreativeTemplateForContext(params) {
  // 1. Load template
  const template = await prisma.creativeTemplate.findUnique({ 
    where: { id: params.templateContentId } 
  });
  
  // 2. Load base content
  const baseContent = await prisma.content.findUnique({ 
    where: { id: template.baseContentId } 
  });
  
  // 3. Parse template fields
  const fieldsData = JSON.parse(template.fields);
  const slots = fieldsData.slots || []; // TemplateSlot[]
  
  // 4. Get business context
  const businessContext = await getBusinessContext(params.storeId);
  // Returns: { business: { id, name, logoUrl, address, phone } }
  
  // 5. Resolve slot values
  const slotValues = buildSlotValues(slots, businessContext);
  // For each slot:
  //   - If sourceKey exists (e.g., "business.name"):
  //       value = getByPath(businessContext, "business.name")
  //   - Else if defaultValue exists:
  //       value = slot.defaultValue
  //   - Store in slotValues[slot.id] = value
  
  // 6. Create new content with slot values in meta
  const newContent = await prisma.content.create({
    data: {
      name: `Template – ${template.name}`,
      elements: baseContent.elements,
      settings: {
        ...baseContent.settings,
        meta: {
          templateSlots: slotValues,
          templateId: template.id,
        },
      },
      // ... other fields
    },
  });
  
  // 7. Return extended response
  return {
    content: newContent,
    templateId: template.id,
    slotValues, // e.g., { business_name: "My Store", business_logo: "https://..." }
    businessContextSummary: { 
      id: businessContext.business.id, 
      name: businessContext.business.name 
    },
  };
}
```

**Key Steps:**
1. Parse `template.fields.slots` array
2. Fetch `Business` by `storeId` (which maps to `Business.id`)
3. For each slot with `sourceKey`, resolve value via dot-notation path
4. Store resolved values in `content.settings.meta.templateSlots`
5. Frontend can access slot values from content metadata

---

## Supported Source Keys

Currently supported `sourceKey` paths:
- `business.name` → Business.name
- `business.description` → Business.description
- `business.logoUrl` → Business.logo.url (parsed from JSON)
- `business.address` → Business.address
- `business.phone` → Business.phone

Future extensions can add:
- `campaign.name`
- `product.name`
- `customer.name`
- `business.primaryColor` (when added to Business model)

---

## TODOs / Follow-ups

### Immediate (Frontend Integration)

1. **Wire slotValues into canvas state**
   - Location: `apps/dashboard/cardbey-marketing-dashboard/src/pages/ContentsStudio.tsx`
   - When content is loaded from `?id=` param, check `content.settings.meta.templateSlots`
   - Apply slot values to canvas elements that reference slot IDs
   - TODO: Define convention for how canvas elements reference slots (e.g., `{{business_name}}` in text nodes)

2. **Update frontend API types**
   - Location: `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`
   - Update `instantiateCreativeTemplate()` return type to include:
     ```typescript
     {
       ok: boolean;
       content: Content;
       templateId?: string;
       slotValues?: Record<string, any>;
       businessContextSummary?: { id: string; name: string };
     }
     ```

3. **SmartTemplatePicker enhancements**
   - Show preview of slot values before instantiation
   - Display which slots will be auto-filled vs. using defaults

### Future Enhancements

4. **AI text generation using aiContext**
   - Use `aiContext.tone`, `aiContext.audience`, `aiContext.language` to generate text for text/richtext slots
   - Integrate with existing AI services (e.g., OpenAI, Claude)

5. **Extend Business model**
   - Add `primaryColor` and `secondaryColor` fields to Business model
   - Support `business.primaryColor` in sourceKey paths

6. **Template preview generation**
   - Generate thumbnail/preview images from template + slot values
   - Show preview in SmartTemplatePicker before instantiation

7. **Template versioning**
   - Handle template field changes for existing instantiations
   - Migration strategy when template structure evolves

### Unified Template Engine (Future)

8. **VideoTemplate model**
   - Reuse `TemplateSlot[]` and `TemplateAIContext` types
   - Add video-specific fields: `duration`, `aspectRatio`, `frameRate`

9. **ReportTemplate model**
   - Reuse shared types
   - Add report-specific fields: `dataSource`, `chartTypes`, `metrics`

10. **ProcessTemplate model**
    - Reuse shared types
    - Add process-specific fields: `steps`, `triggers`, `conditions`

---

## Migration Instructions

1. **Run Prisma migration:**
   ```bash
   cd apps/core/cardbey-core
   npx prisma migrate dev --name add_creative_template_fields
   npx prisma generate
   ```

2. **Build shared package:**
   ```bash
   cd packages/template-engine
   npm run build
   ```

3. **Seed example templates:**
   ```bash
   cd apps/core/cardbey-core
   npx tsx scripts/seedDevTemplates.ts
   ```

4. **Verify API:**
   ```bash
   # List templates (should include fields and aiContext)
   curl http://localhost:3001/api/creative-templates
   
   # Instantiate a template (should return slotValues)
   curl -X POST http://localhost:3001/api/mi/orchestrator/templates/{templateId}/instantiate \
     -H "Content-Type: application/json" \
     -d '{"channel": "cnet_screen", "orientation": "vertical"}'
   ```

---

## Testing Checklist

- [ ] Create template with fields and aiContext via POST /api/creative-templates
- [ ] Update template fields via PUT /api/creative-templates/:id
- [ ] List templates and verify fields/aiContext are parsed correctly
- [ ] Instantiate template and verify slotValues are resolved from business context
- [ ] Verify slotValues are stored in content.settings.meta.templateSlots
- [ ] Test with template that has no fields (backward compatibility)
- [ ] Test with template that has slots but no matching business context
- [ ] Verify sourceKey resolution works for nested paths (business.logoUrl)

---

## Notes

- **Backward Compatible**: Templates without `fields` or `aiContext` continue to work
- **Type Safety**: Shared types in `@cardbey/template-engine` ensure consistency
- **Extensible**: Design supports future VideoTemplate, ReportTemplate, ProcessTemplate
- **Non-Breaking**: Existing template instantiation flows continue to work; new fields are optional

