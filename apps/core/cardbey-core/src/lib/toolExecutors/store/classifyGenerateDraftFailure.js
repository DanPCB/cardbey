const CUSTOMER_SAFE_DRAFT_FAILURE =
  "We couldn't finish preparing your store draft.";

/** Classify Node module-resolution failures for stable diagnostics (never expose paths in UI). */
export function classifyGenerateDraftFailure(err) {
  const code = err?.code != null ? String(err.code) : '';
  const message = err?.message != null ? String(err.message) : String(err ?? '');
  const isModuleMissing =
    code === 'ERR_MODULE_NOT_FOUND' ||
    code === 'MODULE_NOT_FOUND' ||
    /Cannot find (package|module)/i.test(message);
  if (isModuleMissing) {
    return {
      code: 'STORE_BUILD_RUNTIME_DEPENDENCY_MISSING',
      message: CUSTOMER_SAFE_DRAFT_FAILURE,
      developerMessage: message,
      developerCode: code || 'ERR_MODULE_NOT_FOUND',
    };
  }
  return {
    code: 'GENERATE_DRAFT_FAILED',
    message: CUSTOMER_SAFE_DRAFT_FAILURE,
    developerMessage: message,
    developerCode: code || null,
  };
}

export { CUSTOMER_SAFE_DRAFT_FAILURE };
