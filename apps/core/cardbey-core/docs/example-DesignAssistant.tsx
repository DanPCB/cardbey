/**
 * Example Design Assistant Component with AI Background Generation
 * 
 * This is an example showing how to integrate background generation
 * into your existing Design Assistant component.
 * 
 * Copy relevant parts to your actual component file.
 */

import { useState } from "react";
import { generateBackgroundImage, type AiBackgroundRequest } from "../api/ai";

interface DesignAssistantProps {
  onBackgroundGenerated?: (imageUrl: string) => void;
  // ... other props
}

export function DesignAssistant({ onBackgroundGenerated }: DesignAssistantProps) {
  // Existing state
  const [prompt, setPrompt] = useState("");
  const [stylePreset, setStylePreset] = useState<string | undefined>();
  const [goal, setGoal] = useState<"poster" | "banner" | "story" | "square">("poster");
  const [width, setWidth] = useState<number | undefined>();
  const [height, setHeight] = useState<number | undefined>();

  // NEW: Background image state
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
  const [isGeneratingBackground, setIsGeneratingBackground] = useState(false);

  // Generate Design handler
  const handleGenerateDesign = async () => {
    if (!prompt.trim()) {
      alert("Please enter a prompt");
      return;
    }

    try {
      setIsGeneratingBackground(true);

      // Prepare background generation request
      const bgRequest: AiBackgroundRequest = {
        prompt: prompt.trim(),
        stylePreset,
        goal,
        width,
        height,
      };

      // Generate background image
      console.log("[AI] Generating background image...", bgRequest);
      const bg = await generateBackgroundImage(bgRequest);

      if (bg?.ok && bg?.imageUrl) {
        setBackgroundImageUrl(bg.imageUrl);
        
        // Notify parent component
        if (onBackgroundGenerated) {
          onBackgroundGenerated(bg.imageUrl);
        }

        if (bg.placeholder) {
          console.warn("[AI] Using placeholder image:", bg.error || "AI generation failed");
        } else {
          console.log("[AI] Background generated successfully:", {
            url: bg.imageUrl,
            size: `${bg.width}x${bg.height}`,
            source: bg.source,
          });
        }
      } else {
        console.error("[AI] Background generation returned invalid response:", bg);
      }

      // Continue with existing text/layout generation logic here
      // ... your existing code for generating text layers, etc.

    } catch (error) {
      console.error("[AI] Background generation failed:", error);
      // Optionally show error to user
      alert(`Failed to generate background: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsGeneratingBackground(false);
    }
  };

  return (
    <div className="design-assistant">
      <h2>AI Design Assistant</h2>
      
      {/* Prompt input */}
      <input
        type="text"
        placeholder="Example: Summer drink promo poster"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      {/* Style preset */}
      <select
        value={stylePreset || ""}
        onChange={(e) => setStylePreset(e.target.value || undefined)}
      >
        <option value="">No preset</option>
        <option value="Modern & Clean">Modern & Clean</option>
        <option value="Bold & Vibrant">Bold & Vibrant</option>
        <option value="Minimalist">Minimalist</option>
        <option value="Vintage/Retro">Vintage/Retro</option>
        <option value="Corporate">Corporate</option>
        <option value="Playful">Playful</option>
      </select>

      {/* Goal */}
      <select
        value={goal}
        onChange={(e) => setGoal(e.target.value as typeof goal)}
      >
        <option value="poster">Poster</option>
        <option value="banner">Banner</option>
        <option value="story">Story</option>
        <option value="square">Square</option>
      </select>

      {/* Size (optional) */}
      <div>
        <input
          type="number"
          placeholder="Width"
          value={width || ""}
          onChange={(e) => setWidth(e.target.value ? parseInt(e.target.value) : undefined)}
        />
        <input
          type="number"
          placeholder="Height"
          value={height || ""}
          onChange={(e) => setHeight(e.target.value ? parseInt(e.target.value) : undefined)}
        />
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerateDesign}
        disabled={isGeneratingBackground || !prompt.trim()}
      >
        {isGeneratingBackground ? (
          <>
            <span className="spinner" /> Generating...
          </>
        ) : (
          "Generate Design"
        )}
      </button>

      {/* Show current background URL (for debugging) */}
      {backgroundImageUrl && (
        <div className="bg-info">
          Background: {backgroundImageUrl}
        </div>
      )}
    </div>
  );
}







