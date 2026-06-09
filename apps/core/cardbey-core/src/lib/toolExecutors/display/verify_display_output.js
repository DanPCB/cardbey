/**
 * verify_display_output — Confirm device received and is playing content.
 */

import { executeContentTool } from '../executeContentTool.js';

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  return await executeContentTool({
    toolName: 'verify_display_output',
    input,
    context: {},
    processor: (inp) => {
      const pushResult = inp?.pushResult && typeof inp.pushResult === 'object' ? inp.pushResult : {};
      const verified =
        pushResult.ok === true &&
        !pushResult.stub &&
        Boolean(pushResult.pushId) &&
        Boolean(pushResult.deviceId);

      return {
        verified,
        deviceStatus: verified ? 'playing' : 'error',
        message: verified
          ? 'Device received content and is playing'
          : 'Device did not confirm playback',
        deviceId: inp?.deviceId ?? pushResult.deviceId ?? null,
        contentId: inp?.contentId ?? null,
      };
    },
    validateResult: (result) => {
      if (!result?.verified) {
        return {
          blocked: true,
          reason: 'playback_not_verified',
          message: result?.message ?? 'Device did not confirm playback',
        };
      }
      return null;
    },
    isEmpty: () => false,
    countRecords: (result) => (result?.verified ? 1 : 0),
  });
}

export default execute;
