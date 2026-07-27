/**
 * LLM Provider abstraction types.
 * All providers implement generateText (and optionally health).
 */

/**
 * @typedef {Object} GenerateTextOptions
 * @property {number} [timeoutMs]
 * @property {number} [maxRetries]
 */

/**
 * @typedef {Object} GenerateTextResult
 * @property {string} text
 * @property {string} [model]
 * @property {object} [usage]
 */

/**
 * Provider interface: generateText(prompt, options?) => Promise<GenerateTextResult>
 * @typedef {(
 *   (prompt: string, options?: GenerateTextOptions) => Promise<GenerateTextResult>
 * )} GenerateTextFn
 */

/**
 * @typedef {Object} LlmProvider
 * @property {string} name
 * @property {GenerateTextFn} generateText
 * @property {() => Promise<{ ok: boolean; disabled?: boolean; error?: string }>} [health]
 */

export const LLM_ENTRY_POINT = 'llm_generate_copy';
