/**
 * AI Engine Interfaces
 * Stable interfaces for AI providers (Vision, Text, Content, Video)
 * Allows swapping providers without changing business logic
 */

// Note: In JavaScript, we use JSDoc for type documentation
// The actual TypeScript types are in types.ts

/**
 * @typedef {Object} VisionEngine
 * @property {string} name
 * @property {function({imageUrl?: string, imageBase64?: string, task: 'loyalty_card' | 'menu' | 'shopfront' | 'generic'}): Promise<{text?: string, raw?: any}>} analyzeImage
 */

/**
 * @typedef {Object} TextEngine
 * @property {string} name
 * @property {function({systemPrompt?: string, userPrompt: string, temperature?: number, maxTokens?: number}): Promise<{text: string, raw?: any}>} generateText
 */

/**
 * @typedef {Object} ContentEngine
 * @property {string} name
 * @property {function({prompt: string, style?: string, size?: 'square' | 'portrait' | 'landscape'}): Promise<{imageUrl: string, raw?: any}>} generateImage
 */

/**
 * @typedef {Object} VideoEngine
 * @property {string} name
 * @property {function({prompt: string, lengthSeconds?: number, style?: string}): Promise<{videoUrl: string, raw?: any}>} generateVideo
 */


