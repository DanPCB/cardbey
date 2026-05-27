import { applyPatch } from '../../intake/maintenanceTools.js';

export async function execute(input = {}, context = {}) {
  try {
    const output = await applyPatch({
      file: input?.file ?? null,
      patch: input?.patch ?? '',
      context: context && typeof context === 'object' ? context : {},
    });
    if (output?.error) {
      return {
        status: 'failed',
        error: { code: output.error, message: output.error },
      };
    }
    return { status: 'ok', output };
  } catch (err) {
    return {
      status: 'failed',
      error: { code: 'APPLY_PATCH_ERROR', message: err?.message ?? String(err) },
    };
  }
}
