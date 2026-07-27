/**
 * Shared error wrapper for maintenance tool executors.
 */

// Error shape (executor layer):
//   { status: 'failed', error: { code: string, message: string } }
export function wrapMaintenanceExecutor(toolName, fn) {
  return async (params, context) => {
    try {
      return await fn(params, context);
    } catch (err) {
      console.error(`[maintenance/${toolName}] unhandled error:`, err?.message ?? String(err));
      return {
        status: 'failed',
        error: {
          code: 'EXECUTOR_ERROR',
          message: err?.message ?? String(err),
        },
      };
    }
  };
}
