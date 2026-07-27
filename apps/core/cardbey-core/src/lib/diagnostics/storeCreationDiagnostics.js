/**
 * Gated diagnostic logging for store creation / kernel dispatch tracing.
 * Enable via LOG_INTAKE_DIAGNOSTICS, LOG_KERNEL_DISPATCH_DIAGNOSTICS, LOG_LLM_REASONER_DIAGNOSTICS.
 */

function envTruthy(key) {
  return String(process.env[key] ?? '').trim().toLowerCase() === 'true';
}

export function isIntakeDiagEnabled() {
  return envTruthy('LOG_INTAKE_DIAGNOSTICS');
}

export function isKernelDispatchDiagEnabled() {
  return envTruthy('LOG_KERNEL_DISPATCH_DIAGNOSTICS');
}

export function isLlmReasonerDiagEnabled() {
  return envTruthy('LOG_LLM_REASONER_DIAGNOSTICS');
}

/** @param {boolean} enabled */
export function diagLog(enabled, ...args) {
  if (!enabled) return;
  // eslint-disable-next-line no-console
  console.log('[DIAG]', ...args);
}
