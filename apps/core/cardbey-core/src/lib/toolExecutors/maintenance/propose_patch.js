import { proposePatch } from '../../intake/maintenanceTools.js';

export async function execute(input = {}, _context = {}) {
  try {
    const output = await proposePatch({
      file: input?.file ?? null,
      lineRange: input?.lineRange ?? null,
      errorType: input?.errorType ?? 'unknown',
      codeSnippet: input?.codeSnippet ?? null,
      rawLine: input?.rawLine ?? null,
    });
    return { status: 'ok', output };
  } catch (err) {
    return {
      status: 'failed',
      error: { code: 'PROPOSE_PATCH_ERROR', message: err?.message ?? String(err) },
    };
  }
}
