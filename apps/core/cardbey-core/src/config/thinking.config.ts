/**
 * Thinking mode configuration for DeepSeek / intent engine.
 */

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off') return false;
  if (normalized === 'true' || normalized === '1' || normalized === 'on') return true;
  return fallback;
}

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface ThinkingConfig {
  enabled: boolean;
  reasoningEffort: ReasoningEffort;
  showInUi: boolean;
}

export function loadThinkingConfig(): ThinkingConfig {
  const effortRaw = String(process.env.INTENT_ENGINE_REASONING_EFFORT ?? 'medium').trim().toLowerCase();
  const reasoningEffort: ReasoningEffort =
    effortRaw === 'low' ? 'low' : effortRaw === 'high' ? 'high' : 'medium';

  return {
    enabled: parseBool(process.env.INTENT_ENGINE_THINKING_MODE, true),
    reasoningEffort,
    showInUi: parseBool(process.env.INTENT_ENGINE_SHOW_THINKING, true),
  };
}
