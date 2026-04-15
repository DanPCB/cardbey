/**
 * AI Background Image Generation Type Definitions
 * 
 * Copy this file to: src/types/ai.ts (or src/types/AiBackgroundTypes.ts)
 * 
 * Usage:
 * import type { AiBackgroundRequest, AiBackgroundResponse } from '@/types/ai';
 */

/**
 * Request payload for background image generation
 */
export interface AiBackgroundRequest {
  /** Main user prompt describing the desired image */
  prompt: string;
  
  /** Optional style preset (e.g., "Bold & Vibrant", "Minimalist") */
  stylePreset?: string;
  
  /** Design goal/format */
  goal?: "poster" | "banner" | "story" | "square";
  
  /** Optional width in pixels (will be clamped to supported sizes) */
  width?: number;
  
  /** Optional height in pixels (will be clamped to supported sizes) */
  height?: number;
}

/**
 * Response from background image generation endpoint
 */
export interface AiBackgroundResponse {
  /** Whether the request was successful */
  ok: boolean;
  
  /** URL of the generated or placeholder image */
  imageUrl: string;
  
  /** Whether a placeholder was used instead of AI-generated image */
  placeholder: boolean;
  
  /** Actual width of the returned image */
  width: number;
  
  /** Actual height of the returned image */
  height: number;
  
  /** Source of the image */
  source: "openai" | "placeholder";
  
  /** Debug: The prompt that was actually sent to OpenAI */
  debugPrompt?: string;
  
  /** Error message (only present if placeholder was used due to failure) */
  error?: string;
}







