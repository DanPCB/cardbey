/**
 * AI Background Image Generation API Helper
 * 
 * Copy this file to: src/api/aiBackground.api.ts (or merge into existing src/api/ai.ts)
 * 
 * Usage:
 * import { generateBackgroundImage } from '@/api/aiBackground.api';
 * 
 * const result = await generateBackgroundImage({
 *   prompt: "Vietnamese noodle bowl poster",
 *   stylePreset: "Bold & Vibrant",
 *   goal: "poster"
 * });
 */

import type { AiBackgroundRequest, AiBackgroundResponse } from './AiBackgroundTypes';

/**
 * Generate background image using DALL·E 3
 * 
 * @param payload - Request parameters
 * @returns Background image response
 * @throws Error if request fails
 */
export async function generateBackgroundImage(
  payload: AiBackgroundRequest
): Promise<AiBackgroundResponse> {
  // Replace buildApiUrl with your existing API URL builder
  // Examples:
  //   const apiUrl = buildApiUrl("/ai/images/background");
  //   const apiUrl = `${API_BASE_URL}/api/ai/images/background`;
  //   const apiUrl = "/api/ai/images/background"; // if using proxy
  
  const apiUrl = "/api/ai/images/background"; // Adjust based on your setup

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      `AI background generation failed: ${res.status} ${errorData.error || res.statusText}`
    );
  }

  return res.json() as Promise<AiBackgroundResponse>;
}







