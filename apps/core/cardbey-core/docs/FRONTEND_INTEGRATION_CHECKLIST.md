# Frontend Integration Checklist - AI Background Images

Follow these steps **exactly** to integrate AI background image generation into your Contents Studio.

## 📋 Prerequisites

- Frontend repository: `cardbey-marketing-dashboard`
- Backend running: `cardbey-core` on port 3001
- Dependencies installed: `react-konva`, `konva`, `use-image`

---

## 1️⃣ Copy Example Files

Copy these files from `cardbey-core/docs/` to your dashboard repo:

### File Locations:

```
cardbey-core/docs/aiBackground.api.ts
  → cardbey-marketing-dashboard/src/api/aiBackground.api.ts
  (or merge into existing src/api/ai.ts)

cardbey-core/docs/AiBackgroundTypes.ts
  → cardbey-marketing-dashboard/src/types/ai.ts
  (or src/types/AiBackgroundTypes.ts)

cardbey-core/docs/useBackgroundImage.ts
  → cardbey-marketing-dashboard/src/hooks/useBackgroundImage.ts
  (or src/utils/useBackgroundImage.ts)
```

### Update Imports

After copying, update the import in `aiBackground.api.ts`:

```typescript
// Change this:
import type { AiBackgroundRequest, AiBackgroundResponse } from './AiBackgroundTypes';

// To match your file structure:
import type { AiBackgroundRequest, AiBackgroundResponse } from '@/types/ai';
// or
import type { AiBackgroundRequest, AiBackgroundResponse } from '../types/AiBackgroundTypes';
```

---

## 2️⃣ Integrate the API Helper

### Option A: Add to Existing API File

If you have `src/api/ai.ts`, add this function:

```typescript
import type { AiBackgroundRequest, AiBackgroundResponse } from '@/types/ai';

export async function generateBackgroundImage(
  payload: AiBackgroundRequest
): Promise<AiBackgroundResponse> {
  const res = await fetch(buildApiUrl("/ai/images/background"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Failed: ${res.status}`);
  }

  return res.json() as Promise<AiBackgroundResponse>;
}
```

**Replace `buildApiUrl`** with your existing API URL builder function.

### Option B: Use Standalone File

If you copied `aiBackground.api.ts`, just import it:

```typescript
import { generateBackgroundImage } from '@/api/aiBackground.api';
```

---

## 3️⃣ Connect in AI Design Assistant

Find your Design Assistant component (e.g., `src/components/AI/DesignAssistant.tsx` or `src/pages/ContentsStudio.tsx`).

### Add State

```typescript
const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
const [isGenerating, setIsGenerating] = useState(false);
```

### Update Generate Design Handler

Find the "Generate Design" button handler and add:

```typescript
const handleGenerateDesign = async () => {
  try {
    setIsGenerating(true);

    // Collect form values
    const prompt = form.prompt; // or formValues.prompt
    const stylePreset = form.style; // or formValues.stylePreset
    const goal = form.goal; // "poster" | "banner" | "story" | "square"
    const width = form.width;
    const height = form.height;

    // Generate background image
    const background = await generateBackgroundImage({
      prompt,
      stylePreset,
      goal,
      width,
      height,
    });

    if (background?.imageUrl) {
      setBackgroundImageUrl(background.imageUrl);
      
      if (background.placeholder) {
        console.warn("[AI] Using placeholder:", background.error);
      }
    }

    // Continue with your existing text generation logic...
    // ... your existing code ...

  } catch (error) {
    console.error("[AI] Background generation failed:", error);
    // Optionally show error to user
  } finally {
    setIsGenerating(false);
  }
};
```

### Add Loading State to Button

```typescript
<button
  onClick={handleGenerateDesign}
  disabled={isGenerating}
>
  {isGenerating ? (
    <>
      <Spinner /> Generating...
    </>
  ) : (
    "Generate Design"
  )}
</button>
```

---

## 4️⃣ Pass Background URL to Canvas

In your main Contents Studio page component (e.g., `src/pages/ContentsStudio.tsx`):

```typescript
<ContentsCanvas
  backgroundImageUrl={backgroundImageUrl}
  textLayers={generatedTextLayers}
  // ... other props
/>
```

Make sure `backgroundImageUrl` is passed from the Design Assistant component (lift state up or use context if needed).

---

## 5️⃣ Render in Konva Canvas

Open your canvas component (e.g., `src/components/Canvas/ContentsCanvas.tsx`).

### Add Imports

```typescript
import { Image as KonvaImage } from "react-konva";
import useImage from "use-image";
// OR use the custom hook:
// import { useBackgroundImage } from "@/hooks/useBackgroundImage";
```

### Load Image

```typescript
// Option 1: Direct use-image
const [bgImage] = useImage(backgroundImageUrl ?? "", "anonymous");

// Option 2: Custom hook (if you copied useBackgroundImage.ts)
// const { image: bgImage, isLoading } = useBackgroundImage(backgroundImageUrl);
```

### Render Background BEFORE Text Layers

Inside your main `<Layer>`, render the background **first**:

```typescript
<Layer>
  {/* 🚨 BACKGROUND MUST BE FIRST (renders at bottom) */}
  {bgImage && (
    <KonvaImage
      image={bgImage}
      x={0}
      y={0}
      width={canvasWidth}
      height={canvasHeight}
      listening={false}      // 🚨 Prevents being draggable/selectable
    />
  )}

  {/* Then render text layers AFTER (renders on top) */}
  {textLayers.map((layer) => (
    <KonvaText
      key={layer.id}
      x={layer.x}
      y={layer.y}
      text={layer.text}
      // ... other text properties
    />
  ))}
</Layer>
```

**Critical:** The `listening={false}` prop prevents the background from being selectable/movable.

---

## 6️⃣ Handle Placeholder Gracefully

The API automatically returns a placeholder if generation fails. Just show it normally:

```typescript
// The API response already handles placeholders
// Just use the imageUrl as-is:
if (background?.imageUrl) {
  setBackgroundImageUrl(background.imageUrl);
  
  // Optional: Log if placeholder was used
  if (background.placeholder) {
    console.warn("[AI] Using placeholder image");
  }
}
```

No special UI needed - the placeholder image will display normally.

---

## ✅ Testing Checklist

Test each of these scenarios:

- [ ] Click "Generate Design" → Background image appears
- [ ] Text layers render on top of background
- [ ] Background is NOT selectable/draggable
- [ ] Loading spinner shows during generation
- [ ] Placeholder displays if AI fails
- [ ] Canvas doesn't resize when switching AI/Manual mode
- [ ] Manual mode still works normally
- [ ] No console errors

---

## 🐛 Troubleshooting

### Image not loading
- Check browser console for CORS errors
- Verify `imageUrl` is absolute or relative to your API base
- Check network tab to see if request succeeds

### Background appears on top of text
- Ensure `KonvaImage` is rendered **BEFORE** text layers in the JSX
- Check z-index/rendering order

### Background is selectable
- Add `listening={false}` to `KonvaImage`

### API errors
- Verify backend is running: `curl http://localhost:3001/health`
- Check `buildApiUrl` returns correct base URL
- Ensure `OPENAI_API_KEY` is set in backend `.env`

---

## 📝 File Structure Summary

After integration, your frontend should have:

```
cardbey-marketing-dashboard/
├── src/
│   ├── api/
│   │   └── aiBackground.api.ts (or merged into ai.ts)
│   ├── types/
│   │   └── ai.ts (contains AiBackgroundRequest, AiBackgroundResponse)
│   ├── hooks/
│   │   └── useBackgroundImage.ts (optional)
│   ├── components/
│   │   ├── AI/
│   │   │   └── DesignAssistant.tsx (updated)
│   │   └── Canvas/
│   │       └── ContentsCanvas.tsx (updated)
│   └── pages/
│       └── ContentsStudio.tsx (updated)
```

---

## 🎉 Done!

Once all steps are complete, clicking "Generate Design" will:
1. Call the backend API
2. Generate a DALL·E 3 image
3. Display it as the canvas background
4. Show text layers on top

You now have a real poster instead of text floating on a dark grid! 🚀







