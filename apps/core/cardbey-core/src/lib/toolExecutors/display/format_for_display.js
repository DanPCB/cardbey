/**
 * format_for_display — Adapt content to screen display profile.
 */

import { executeContentTool } from '../executeContentTool.js';

const DEFAULT_DISPLAY_PROFILE = {
  width: 1920,
  height: 1080,
  durationPerSlide: 5000,
  loop: true,
  transition: 'fade',
};

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  return await executeContentTool({
    toolName: 'format_for_display',
    input,
    context: {},
    processor: (inp) => {
      const content = inp?.content && typeof inp.content === 'object' ? inp.content : {};
      const displayProfile = {
        ...DEFAULT_DISPLAY_PROFILE,
        ...(inp?.displayProfile && typeof inp.displayProfile === 'object' ? inp.displayProfile : {}),
      };

      const formatted = {
        ...content,
        displayProfile,
        formattedAt: new Date().toISOString(),
        readyForDevice: true,
      };

      return { formatted };
    },
    isEmpty: (result) => {
      const formatted = result?.formatted;
      if (!formatted || typeof formatted !== 'object') return true;
      const keys = Object.keys(formatted).filter(
        (k) => !['displayProfile', 'formattedAt', 'readyForDevice'].includes(k),
      );
      return keys.length === 0;
    },
    countRecords: () => 1,
  });
}

export default execute;
