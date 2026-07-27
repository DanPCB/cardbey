# AI Background Image Integration Guide

This guide shows how to integrate the AI background image generation endpoint into the Contents Studio frontend.

## Backend Endpoint

The backend endpoint is already implemented and available at:

```
POST /api/ai/images/background
```

**Request:**
```typescript
{
  prompt: string;
  stylePreset?: string;
  goal?: "poster" | "banner" | "story" | "square";
  width?: number;
  height?: number;
}
```

**Response:**
```typescript
{
  ok: boolean;
  imageUrl: string;
  placeholder: boolean;
  width: number;
  height: number;
  source: "openai" | "placeholder";
  debugPrompt?: string;
  error?: string;
}
```

## Implementation Steps

### Step 1: Add API Helper

Create or update `src/api/ai.ts` (or wherever your AI API helpers are located):

```typescript
export interface AiBackgroundRequest {
  prompt: string;
  stylePreset?: string;
  goal?: "poster" | "banner" | "story" | "square";
  width?: number;
  height?: number;
}

export interface AiBackgroundResponse {
  ok: boolean;
  imageUrl: string;
  placeholder: boolean;
  width: number;
  height: number;
  source: "openai" | "placeholder";
  debugPrompt?: string;
  error?: string;
}

export async function generateBackgroundImage(
  payload: AiBackgroundRequest
): Promise<AiBackgroundResponse> {
  const res = await fetch(buildApiUrl("/ai/images/background"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`AI background HTTP ${res.status}`);
  }

  return res.json();
}
```

**Note:** Replace `buildApiUrl` with your existing API URL builder function.

### Step 2: Update Design Assistant Component

In your Design Assistant component (e.g., `src/components/AI/DesignAssistant.tsx`), add:

```typescript
import { useState } from "react";
import { generateBackgroundImage } from "../../api/ai";

// Add state for background image
const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
const [isGeneratingBackground, setIsGeneratingBackground] = useState(false);

// In your Generate Design handler:
const handleGenerateDesign = async () => {
  try {
    setIsGeneratingBackground(true);
    
    // Collect form values
    const prompt = formValues.prompt;
    const stylePreset = formValues.stylePreset;
    const goal = formValues.goal; // "poster" | "banner" | "story" | "square"
    const width = formValues.width;
    const height = formValues.height;

    // Generate background image
    const bg = await generateBackgroundImage({
      prompt,
      stylePreset,
      goal,
      width,
      height,
    });

    if (bg?.imageUrl) {
      setBackgroundImageUrl(bg.imageUrl);
      
      if (bg.placeholder) {
        console.warn("[AI] Using placeholder image:", bg.error);
      } else {
        console.log("[AI] Generated background:", bg.imageUrl);
      }
    }

    // Continue with existing text generation logic...
    // (keep your existing code here)
    
  } catch (error) {
    console.error("[AI] Background generation failed:", error);
    // Optionally show error to user
  } finally {
    setIsGeneratingBackground(false);
  }
};
```

### Step 3: Pass Background URL to Canvas

In your main Contents Studio page component, pass the background image URL to the canvas:

```typescript
<ContentsCanvas
  backgroundImageUrl={backgroundImageUrl}
  textLayers={generatedTextLayers}
  // ... other props
/>
```

### Step 4: Render Background in Konva Canvas

In your canvas component (e.g., `src/components/Canvas/ContentsCanvas.tsx`), add:

```typescript
import { Image as KonvaImage } from "react-konva";
import useImage from "use-image";

// Inside your component:
const [bgImage] = useImage(backgroundImageUrl ?? "", "anonymous");

// In your render, inside the main <Layer>, BEFORE text layers:
{bgImage && (
  <KonvaImage
    image={bgImage}
    x={0}
    y={0}
    width={canvasWidth}
    height={canvasHeight}
    listening={false}   // Not selectable/movable
  />
)}

// Then render your text layers AFTER the background image
{textLayers.map((layer) => (
  // ... your existing text layer rendering
))}
```

**Important:** The background image must be rendered BEFORE text layers so text appears on top.

### Step 5: Update Generate Design Button

Update your button to show loading state:

```typescript
<button
  onClick={handleGenerateDesign}
  disabled={isGeneratingBackground}
>
  {isGeneratingBackground ? (
    <>
      <Spinner /> Generating...
    </>
  ) : (
    "Generate Design"
  )}
</button>
```

## Complete Example Files

See the example files in this directory:
- `example-api-ai.ts` - API helper
- `example-DesignAssistant.tsx` - Design Assistant component
- `example-ContentsCanvas.tsx` - Canvas component

## Testing Checklist

- [ ] Clicking "Generate Design" calls the API
- [ ] Background image appears in canvas
- [ ] Text layers render on top of background
- [ ] Placeholder images work when AI fails
- [ ] Loading state shows during generation
- [ ] Canvas doesn't resize when switching modes
- [ ] Manual mode still works normally

## Troubleshooting

### Image not loading
- Check CORS settings on backend
- Verify `imageUrl` is absolute or relative to your API base
- Check browser console for CORS/network errors

### Background appears behind text
- Ensure KonvaImage is rendered BEFORE text layers in the Layer component
- Check z-index/rendering order

### API errors
- Verify backend is running on correct port
- Check `buildApiUrl` function returns correct base URL
- Ensure `OPENAI_API_KEY` is set in backend `.env`







