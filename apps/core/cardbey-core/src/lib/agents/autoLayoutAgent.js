/**
 * Auto-Layout Agent — backward-compatible wrapper around the General Layout Engine (text layout).
 */

import { LayoutEngine } from '../layout/layoutEngine.js';

export class AutoLayoutAgent {
  constructor() {
    this.engine = new LayoutEngine();
  }

  /**
   * Process messy text and return clean layout.
   * @param {string} text
   * @param {Record<string, unknown>} [options]
   */
  async process(text, options = {}) {
    const result = await this.engine.applyLayout(text, 'text', options);

    return {
      original: result.original,
      processed: result.processed,
      type: result.stats?.subtype || result.type,
      stats: {
        lines: result.stats.lines,
        chars: result.stats.chars,
        words: result.stats.words,
        paragraphs: result.stats.paragraphs,
      },
    };
  }
}

export default AutoLayoutAgent;
