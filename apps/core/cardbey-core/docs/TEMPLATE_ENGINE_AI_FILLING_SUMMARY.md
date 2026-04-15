# Template Engine v1 - AI Text Filling & Canvas Wiring - Implementation Summary

## Overview

Completed implementation of AI-powered text filling for template slots and wiring slot values into canvas nodes when template-backed content is loaded.

---

## Files Created

1. **`apps/core/cardbey-core/src/services/templateAITextService.ts`**
   - `generateTextForSlot()` function
   - Uses existing `openaiTextEngine` from `ai/engines/openaiTextEngine.js`
   - Builds prompts from slot metadata, AI context, and business context
   - Returns generated text or null on failure (non-blocking)

2. **`apps/core/cardbey-core/docs/TEMPLATE_ENGINE_AI_FILLING.md`**
   - Complete documentation of AI filling and canvas wiring
   - Examples and flow diagrams

---

## Files Modified

### Backend

1. **`apps/core/cardbey-core/src/services/miOrchestratorService.ts`**
   - Extended `InstantiateTemplateParams` interface with `autoFillText?: boolean`
   - Added AI text filling logic after slot value resolution
   - Only fills text/richtext slots that don't have values from sourceKey/defaultValue
   - Stores final `slotValues` in `content.settings.meta.templateSlots`

2. **`apps/core/cardbey-core/src/routes/miRoutes.js`**
   - Accepts `autoFillText` boolean in request body (defaults to false)
   - Returns extended response: `{ ok, content, templateId, slotValues, businessContextSummary }`

### Frontend

3. **`apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`**
   - Updated `instantiateCreativeTemplate()` signature to accept `autoFillText` option
   - Returns extended response with `slotValues` and `businessContextSummary`

4. **`apps/dashboard/cardbey-marketing-dashboard/src/components/creative-engine/SmartTemplatePicker.tsx`**
   - Passes `autoFillText: true` when instantiating templates
   - Updated `onUseTemplate` callback signature to receive slot values
   - TODO: Add UI toggle for user control (currently hardcoded to `true`)

5. **`apps/dashboard/cardbey-marketing-dashboard/src/features/contents-studio/canvasStore.ts`**
   - Added `meta?: { templateSlotId?: string; [key: string]: any }` to `NodeBase` interface
   - Allows nodes to reference template slots via `node.meta.templateSlotId`

6. **`apps/dashboard/cardbey-marketing-dashboard/src/pages/ContentsStudio.tsx`**
   - Added post-processing step when loading template-backed content
   - Checks for `settings.meta.templateId` to identify template-backed content
   - Applies `slotValues` to text nodes with matching `meta.templateSlotId`
   - Only processes text/richtext nodes (scoped to template content only)

7. **`apps/dashboard/cardbey-marketing-dashboard/src/pages/CreativeEngineShellPage.tsx`**
   - Updated `onUseTemplate` callback to receive and log slot values

8. **`apps/core/cardbey-core/docs/template-engine-v1.md`**
   - Added section on "Canvas Node → Template Slot Mapping"
   - Added section on "AI Text Filling"
   - Updated TODOs to reflect completed work

---

## Example: Template Slot → Canvas Node Flow

### 1. Template Definition

**CreativeTemplate.fields:**
```json
{
  "slots": [
    {
      "id": "headline",
      "label": "Headline",
      "type": "text",
      "sourceKey": "business.name"
    },
    {
      "id": "subheadline",
      "label": "Subheadline",
      "type": "text",
      "description": "Supporting text"
    }
  ]
}
```

**CreativeTemplate.aiContext:**
```json
{
  "tone": "energetic",
  "audience": "general",
  "styleHints": ["bold", "attention-grabbing"]
}
```

### 2. Base Content (Canvas JSON)

**Content.elements:**
```json
[
  {
    "id": "text_headline",
    "kind": "text",
    "text": "{{headline}}",
    "meta": {
      "templateSlotId": "headline"
    }
  },
  {
    "id": "text_subheadline",
    "kind": "text",
    "text": "{{subheadline}}",
    "meta": {
      "templateSlotId": "subheadline"
    }
  }
]
```

### 3. After Instantiation (with autoFillText: true)

**Backend creates Content with:**
```json
{
  "settings": {
    "meta": {
      "templateId": "tmpl_123",
      "templateSlots": {
        "headline": "My Store",              // From business.name
        "subheadline": "Special offer..."    // AI-generated
      }
    }
  }
}
```

**Frontend applies slot values:**
- `text_headline.text` → `"My Store"` (from business context)
- `text_subheadline.text` → `"Special offer..."` (AI-generated)

---

## AI Text Generation Flow

1. **Resolve from sourceKey/defaultValue first**
   - `buildSlotValues()` fills slots from business context
   - Example: `headline` → `"My Store"` (from `business.name`)

2. **AI fill empty text/richtext slots** (if `autoFillText: true`)
   - For each slot without a value:
     - Build prompt from slot label, description, AI context, business context
     - Call `generateTextForSlot()` using `openaiTextEngine`
     - Store generated text in `slotValues[slot.id]`

3. **Store in content metadata**
   - `content.settings.meta.templateSlots = slotValues`
   - `content.settings.meta.templateId = template.id`

4. **Frontend applies to canvas**
   - On load, check for `settings.meta.templateId`
   - For each text node with `meta.templateSlotId`, apply `slotValues[templateSlotId]`

---

## Backward Compatibility

✅ **Non-template content**: No changes - nodes without `meta.templateSlotId` are unchanged

✅ **Templates without fields**: Works as before - no slot resolution attempted

✅ **Templates without aiContext**: AI filling skipped gracefully

✅ **autoFillText: false** (default): Only sourceKey/defaultValue resolution, no AI calls

✅ **AI failures**: Don't block instantiation - slot remains empty or uses defaultValue

✅ **Existing content**: No breaking changes - only template-backed content is processed

---

## Testing Checklist

- [ ] Create template with fields and aiContext
- [ ] Instantiate template with `autoFillText: true`
- [ ] Verify slot values are resolved from business context
- [ ] Verify AI fills empty text slots
- [ ] Verify slot values are stored in `content.settings.meta.templateSlots`
- [ ] Load template-backed content in ContentsStudio
- [ ] Verify text nodes are auto-filled with slot values
- [ ] Verify non-template content loads unchanged
- [ ] Test with `autoFillText: false` (should skip AI)
- [ ] Test with missing AI context (should skip AI gracefully)
- [ ] Test with OpenAI API key missing (should skip AI gracefully)

---

## Follow-up Recommendations

1. **UI Toggle for AI Auto-fill**
   - Add checkbox in SmartTemplatePicker: "Auto-fill text with AI"
   - Default to `true`, but allow user control

2. **Slot Value Preview**
   - Show preview of resolved slot values in SmartTemplatePicker before instantiation
   - Display which values came from business context vs. AI vs. defaults

3. **Batch Language Generation**
   - Support generating slot values for multiple languages at once
   - Store in `content.settings.meta.templateSlotsByLang`

4. **Image Slot Support**
   - Extend AI service to suggest images for `type: 'image'` slots
   - Use business logo or AI-generated images

5. **Template Editor**
   - UI for creating/editing templates with slot definitions
   - Visual mapping of slots to canvas nodes

6. **Template Preview**
   - Generate preview thumbnails from template + slot values
   - Show in SmartTemplatePicker before instantiation

---

## Key Implementation Details

### Node → Slot Mapping Convention

Text nodes that should be auto-filled must have:
```typescript
node.meta = {
  templateSlotId: "headline" // Matches TemplateSlot.id
};
```

### Slot Value Resolution Priority

1. **sourceKey** (e.g., `business.name`) → Resolved from business context
2. **defaultValue** → Used if sourceKey doesn't resolve
3. **AI generation** (if `autoFillText: true`) → Only for empty text/richtext slots

### Safety & Error Handling

- AI failures are non-blocking (logged, but don't fail instantiation)
- Missing AI context is handled gracefully (skips AI filling)
- Missing OpenAI API key is handled gracefully (skips AI filling)
- Only template-backed content is processed (checked via `settings.meta.templateId`)

---

## Summary

✅ **AI Text Filling**: Implemented using existing `openaiTextEngine`, fills empty text/richtext slots based on AI context and business context

✅ **Canvas Wiring**: Slot values are automatically applied to text nodes when template-backed content is loaded

✅ **Backward Compatible**: Non-template content and existing flows remain unchanged

✅ **Extensible**: Foundation ready for future enhancements (image slots, batch language generation, etc.)

