/**
 * AI Engine Registry
 * Central registry for all AI engine implementations
 * Provides getter functions to retrieve engines by name
 */

import type {
  VisionEngine,
  TextEngine,
  ContentEngine,
  VideoEngine,
} from './types.js';
import { openaiVisionEngine } from './openaiVisionEngine.js';
import { openaiTextEngine } from './openaiTextEngine.js';
import { openaiContentEngine } from './openaiContentEngine.js';
import { openaiVideoEngine } from './openaiVideoEngine.js';

// ============================================================================
// Vision Engines Registry
// ============================================================================

export const visionEngines: Record<string, VisionEngine> = {
  default: openaiVisionEngine,
  'openai-vision-v1': openaiVisionEngine,
};

export function getVisionEngine(name = 'default'): VisionEngine {
  const engine = visionEngines[name];
  if (!engine) {
    console.warn(`[AI Engines] Vision engine "${name}" not found, using default`);
    return visionEngines.default;
  }
  return engine;
}

// ============================================================================
// Text Engines Registry
// ============================================================================

export const textEngines: Record<string, TextEngine> = {
  default: openaiTextEngine,
  'openai-text-v1': openaiTextEngine,
};

export function getTextEngine(name = 'default'): TextEngine {
  const engine = textEngines[name];
  if (!engine) {
    console.warn(`[AI Engines] Text engine "${name}" not found, using default`);
    return textEngines.default;
  }
  return engine;
}

// ============================================================================
// Content Engines Registry
// ============================================================================

export const contentEngines: Record<string, ContentEngine> = {
  default: openaiContentEngine,
  'openai-content-v1': openaiContentEngine,
};

export function getContentEngine(name = 'default'): ContentEngine {
  const engine = contentEngines[name];
  if (!engine) {
    console.warn(`[AI Engines] Content engine "${name}" not found, using default`);
    return contentEngines.default;
  }
  return engine;
}

// ============================================================================
// Video Engines Registry
// ============================================================================

export const videoEngines: Record<string, VideoEngine> = {
  default: openaiVideoEngine,
  'openai-video-v1-placeholder': openaiVideoEngine,
};

export function getVideoEngine(name = 'default'): VideoEngine {
  const engine = videoEngines[name];
  if (!engine) {
    console.warn(`[AI Engines] Video engine "${name}" not found, using default`);
    return videoEngines.default;
  }
  return engine;
}

// ============================================================================
// Engine Registration Helpers
// ============================================================================

/**
 * Register a new vision engine
 */
export function registerVisionEngine(name: string, engine: VisionEngine): void {
  visionEngines[name] = engine;
  console.log(`[AI Engines] Registered vision engine: ${name}`);
}

/**
 * Register a new text engine
 */
export function registerTextEngine(name: string, engine: TextEngine): void {
  textEngines[name] = engine;
  console.log(`[AI Engines] Registered text engine: ${name}`);
}

/**
 * Register a new content engine
 */
export function registerContentEngine(name: string, engine: ContentEngine): void {
  contentEngines[name] = engine;
  console.log(`[AI Engines] Registered content engine: ${name}`);
}

/**
 * Register a new video engine
 */
export function registerVideoEngine(name: string, engine: VideoEngine): void {
  videoEngines[name] = engine;
  console.log(`[AI Engines] Registered video engine: ${name}`);
}


