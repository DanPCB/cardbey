/**
 * Phase 4 integration point: CrewAI-backed executors. Phase 2 stub only.
 *
 * @param {object} _input
 * @param {object} [_context]
 * @returns {Promise<{ status: 'failed', error: { code: string, message: string } }>}
 */
export async function executeCrewAIStub(_input = {}, _context = undefined) {
  return {
    status: 'failed',
    error: {
      code: 'CREWAI_NOT_IMPLEMENTED',
      message: 'CrewAI executor stub (Phase 4)',
    },
  };
}
