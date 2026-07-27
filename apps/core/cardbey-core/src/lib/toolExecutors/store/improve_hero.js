/**
 * Store tool: improve_hero — honest blocker until hero generation is wired.
 * Input: { storeId }.
 */

/**
 * @param {object} input
 * @param {string} [input.storeId]
 * @returns {Promise<{ status: 'blocked', reason: string, blocker: { code: string, message: string, requiredAction: string }, output: { storeId: string | null } }>}
 */
export async function execute(input = {}) {
  const storeId = typeof input?.storeId === 'string' ? input.storeId : null;
  return {
    status: 'blocked',
    reason: 'hero_generation_not_available',
    blocker: {
      code: 'hero_generation_not_available',
      message: 'Hero improvement is not available yet. Configure a media provider or use edit_artifact.',
      requiredAction: 'configure_media_provider',
    },
    output: { storeId },
  };
}
