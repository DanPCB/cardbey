/**
 * Example API Helper for AI Background Image Generation
 * 
 * Copy this to: src/api/ai.ts (or your existing AI API helpers file)
 * 
 * Make sure to import/use your existing buildApiUrl helper function
 */

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
  // Replace with your existing API URL builder
  // Example: const apiUrl = buildApiUrl("/ai/images/background");
  // Or: const apiUrl = `${API_BASE_URL}/api/ai/images/background`;
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

  return res.json();
}







