/**
 * AI Engine Interfaces
 * Stable interfaces for AI providers (Vision, Text, Content, Video)
 * Allows swapping providers without changing business logic
 */

// ============================================================================
// Vision Engine Interface
// ============================================================================

export interface VisionEngine {
  name: string;
  analyzeImage(input: {
    imageUrl?: string;
    imageBase64?: string;
    task: 'loyalty_card' | 'menu' | 'shopfront' | 'generic';
  }): Promise<{
    text?: string;
    raw?: any;
  }>;
}

// ============================================================================
// Text Engine Interface
// ============================================================================

export interface TextEngine {
  name: string;
  generateText(input: {
    systemPrompt?: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{
    text: string;
    raw?: any;
  }>;
}

// ============================================================================
// Content Engine Interface (Image Generation)
// ============================================================================

export interface ContentEngine {
  name: string;
  generateImage(input: {
    prompt: string;
    style?: string;
    size?: 'square' | 'portrait' | 'landscape';
  }): Promise<{
    imageUrl: string;
    raw?: any;
  }>;
}

// ============================================================================
// Video Engine Interface
// ============================================================================

export interface VideoEngine {
  name: string;
  generateVideo(input: {
    prompt: string;
    lengthSeconds?: number;
    style?: string;
  }): Promise<{
    videoUrl: string;
    raw?: any;
  }>;
}


