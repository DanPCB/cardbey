# Template Engine v1 - AI Text Filling & Canvas Wiring

## Implementation Summary

### Files Created

1. **`apps/core/cardbey-core/src/services/templateAITextService.ts`**
   - `generateTextForSlot()` - AI text generation for template slots
   - Uses existing `openaiTextEngine` from `ai/engines/openaiTextEngine.js`
   - Builds prompts from slot metadata, AI context, and business context

### Files Modified

#### Backend

1. **`apps/core/cardbey-core/src/services/miOrchestratorService.ts`**
   - Extended `InstantiateTemplateParams` with `autoFillText?: boolean`
   - Added AI text filling logic after slot value resolution
   - Only fills text/richtext slots that don't have values yet
   - Stores final `slotValues` in `content.settings.meta.templateSlots`

2. **`apps/core/cardbey-core/src/routes/miRoutes.js`**
   - Accepts `autoFillText` in request body
   - Returns extended response: `{ ok, content, templateId, slotValues, businessContextSummary }`

#### Frontend

3. **`apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`**
   - Updated `instantiateCreativeTemplate()` to accept `autoFillText` option
   - Returns extended response with `slotValues` and `businessContextSummary`

4. **`apps/dashboard/cardbey-marketing-dashboard/src/components/creative-engine/SmartTemplatePicker.tsx`**
   - Passes `autoFillText: true` when instantiating templates
   - Updated `onUseTemplate` callback to receive slot values

5. **`apps/dashboard/cardbey-marketing-dashboard/src/features/contents-studio/canvasStore.ts`**
   - Added `meta?: { templateSlotId?: string; [key: string]: any }` to `NodeBase` interface

6. **`apps/dashboard/cardbey-marketing-dashboard/src/pages/ContentsStudio.tsx`**
   - Added post-processing step when loading template-backed content
   - Applies `slotValues` to text nodes with `meta.templateSlotId`
   - Only runs if `settings.meta.templateId` exists (scoped to template content)

---

## Example: Template Slot → Canvas Node Mapping

### Template Definition

**CreativeTemplate.fields:**
```json
{
  "slots": [
    {
      "id": "headline",
      "label": "Headline",
      "type": "text",
      "required": true,
      "sourceKey": "business.name",
      "description": "Main headline for the promotion"
    },
    {
      "id": "subheadline",
      "label": "Subheadline",
      "type": "text",
      "required": false,
      "description": "Supporting text below headline"
    }
  ]
}
```

**CreativeTemplate.aiContext:**
```json
{
  "tone": "energetic",
  "audience": "general",
  "language": "en",
  "styleHints": ["bold", "attention-grabbing"]
}
```

### Base Content (Canvas JSON)

**Content.elements (nodes array):**
```json
[
  {
    "id": "text_headline",
    "kind": "text",
    "text": "{{headline}}",
    "fontSize": 72,
    "meta": {
      "templateSlotId": "headline"
    }
  },
  {
    "id": "text_subheadline",
    "kind": "text",
    "text": "{{subheadline}}",
    "fontSize": 36,
    "meta": {
      "templateSlotId": "subheadline"
    }
  }
]
```

### After Instantiation

**Backend creates Content with:**
```json
{
  "id": "content_123",
  "settings": {
    "meta": {
      "templateId": "tmpl_456",
      "templateSlots": {
        "headline": "My Store",           // From business.name
        "subheadline": "Special offer..."  // AI-generated
      }
    }
  }
}
```

**Frontend applies slot values:**
```typescript
// In ContentsStudio.tsx loadDesignFromUrl()
if (templateId && slotValues) {
  processedNodes = nodes.map(node => {
    if (node.kind === 'text' && node.meta?.templateSlotId) {
      const slotId = node.meta.templateSlotId;
      if (slotValues[slotId]) {
        return { ...node, text: slotValues[slotId] };
      }
    }
    return node;
  });
}
```

**Result: Canvas shows:**
- `text_headline.text = "My Store"` (from business context)
- `text_subheadline.text = "Special offer..."` (AI-generated)

---

## AI Text Generation Flow

**Pseudo-code:**

```typescript
// 1. Resolve from sourceKey/defaultValue first
slotValues = buildSlotValues(slots, businessContext);
// Result: { headline: "My Store" } (from business.name)

// 2. AI fill empty text/richtext slots (if autoFillText: true)
for (const slot of slots) {
  if ((slot.type === 'text' || slot.type === 'richtext') && !slotValues[slot.id]) {
    const generated = await generateTextForSlot({
      slot,
      aiContext: template.aiContext,
      businessContext,
      language: 'en',
    });
    if (generated) {
      slotValues[slot.id] = generated;
    }
  }
}

// 3. Store in content
content.settings.meta.templateSlots = slotValues;
```

**AI Prompt Example:**

```
System: You are a professional copywriter creating marketing content for a business.
Generate concise, engaging text that matches the requested tone (energetic) and audience (general).
Style: bold, attention-grabbing.
Keep it brief and suitable for visual design templates.

User: Generate text for a template slot labeled "Subheadline".
Description: Supporting text below headline
Business context: My Store (A modern coffee shop)
Language: English

Generate a short, engaging text (1-2 sentences max) that fits this slot and matches the business context.
Return only the text, no explanations or quotes.
```

---

## Backward Compatibility

✅ **Non-template content**: No changes - nodes without `meta.templateSlotId` are unchanged

✅ **Templates without fields**: Works as before - no slot resolution attempted

✅ **Templates without aiContext**: AI filling skipped gracefully

✅ **autoFillText: false** (default): Only sourceKey/defaultValue resolution, no AI calls

✅ **AI failures**: Don't block instantiation - slot remains empty or uses defaultValue

---

## Follow-up Recommendations

1. **UI Toggle for AI Auto-fill**
   - Add checkbox in SmartTemplatePicker: "Auto-fill text with AI"
   - Default to `true` for now, but allow user control

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

