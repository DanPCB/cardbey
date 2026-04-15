/**
 * Example Contents Canvas Component with Konva Background Image
 * 
 * This is an example showing how to render the AI-generated background
 * image in your Konva canvas.
 * 
 * Copy relevant parts to your actual canvas component file.
 */

import React from "react";
import { Stage, Layer, Image as KonvaImage, Text as KonvaText } from "react-konva";
import useImage from "use-image";

interface ContentsCanvasProps {
  backgroundImageUrl: string | null;
  textLayers: Array<{
    id: string;
    text: string;
    x: number;
    y: number;
    fontSize?: number;
    fill?: string;
    // ... other text properties
  }>;
  canvasWidth: number;
  canvasHeight: number;
  // ... other props
}

export function ContentsCanvas({
  backgroundImageUrl,
  textLayers,
  canvasWidth,
  canvasHeight,
}: ContentsCanvasProps) {
  // Load background image using use-image hook
  // The "anonymous" parameter enables CORS for cross-origin images
  const [bgImage, bgImageStatus] = useImage(backgroundImageUrl ?? "", "anonymous");

  // Optional: Show loading state
  const isBackgroundLoading = backgroundImageUrl && bgImageStatus === "loading";

  return (
    <div className="contents-canvas">
      <Stage width={canvasWidth} height={canvasHeight}>
        <Layer>
          {/* 
            CRITICAL: Background image must be rendered FIRST
            so it appears behind all text layers
          */}
          {bgImage && (
            <KonvaImage
              image={bgImage}
              x={0}
              y={0}
              width={canvasWidth}
              height={canvasHeight}
              listening={false} // Not selectable/movable
            />
          )}

          {/* Optional: Show loading indicator */}
          {isBackgroundLoading && (
            <KonvaText
              x={canvasWidth / 2 - 50}
              y={canvasHeight / 2}
              text="Loading background..."
              fill="#666"
              fontSize={14}
            />
          )}

          {/* Render text layers AFTER background */}
          {textLayers.map((layer) => (
            <KonvaText
              key={layer.id}
              x={layer.x}
              y={layer.y}
              text={layer.text}
              fontSize={layer.fontSize || 24}
              fill={layer.fill || "#000000"}
              // ... other text properties
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}

/**
 * Alternative: If you're using multiple layers for z-ordering
 */
export function ContentsCanvasWithLayers({
  backgroundImageUrl,
  textLayers,
  canvasWidth,
  canvasHeight,
}: ContentsCanvasProps) {
  const [bgImage] = useImage(backgroundImageUrl ?? "", "anonymous");

  return (
    <div className="contents-canvas">
      <Stage width={canvasWidth} height={canvasHeight}>
        {/* Background layer (bottom) */}
        <Layer>
          {bgImage && (
            <KonvaImage
              image={bgImage}
              x={0}
              y={0}
              width={canvasWidth}
              height={canvasHeight}
              listening={false}
            />
          )}
        </Layer>

        {/* Text/content layer (top) */}
        <Layer>
          {textLayers.map((layer) => (
            <KonvaText
              key={layer.id}
              x={layer.x}
              y={layer.y}
              text={layer.text}
              fontSize={layer.fontSize || 24}
              fill={layer.fill || "#000000"}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}







