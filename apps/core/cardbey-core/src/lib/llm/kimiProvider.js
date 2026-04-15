/**
 * Re-export Kimi K2.5 provider (implementation in kimiProvider.ts).
 * Env: KIMI_API_KEY, KIMI_BASE_URL (optional), KIMI_DISABLED (kill switch).
 */

export { generateText, health, kimiProvider } from './kimiProvider.ts';
