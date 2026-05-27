import { auditCodebase } from '../../intake/maintenanceTools.js';

export async function execute(input = {}, _context = {}) {
  try {
    const output = await auditCodebase({
      errorMessage: input?.errorMessage ?? '',
      stackTrace: input?.stackTrace ?? '',
      context: input?.context ?? '',
    });
    return { status: 'ok', output };
  } catch (err) {
    return {
      status: 'failed',
      error: { code: 'AUDIT_CODEBASE_ERROR', message: err?.message ?? String(err) },
    };
  }
}
