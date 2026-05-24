/**
 * Thrown when a required LLM step fails (route should map to 500).
 */
export class MenuExtractionLlmError extends Error {
  /**
   * @param {string} message
   * @param {{ cause?: unknown }} [opts]
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = 'MenuExtractionLlmError';
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}
