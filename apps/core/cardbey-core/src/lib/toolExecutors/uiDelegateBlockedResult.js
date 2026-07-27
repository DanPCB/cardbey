/**
 * Honest blocked result for tools that only delegate to UI (no server-side completion).
 */

/**
 * @param {object} options
 * @param {string} options.action — Client UI action id (e.g. open_menu_upload_ui)
 * @param {string} options.message — Human-readable blocker message
 * @param {string} [options.reason='requires_user_input']
 * @param {string} [options.requiredAction] — Defaults to action
 * @param {object} [options.output] — Extra fields merged into output (action set automatically)
 */
export function uiDelegateBlockedResult({
  action,
  message,
  reason = 'requires_user_input',
  requiredAction,
  output = {},
}) {
  return {
    status: 'blocked',
    reason,
    message,
    blocker: {
      code: reason,
      message,
      requiredAction: requiredAction ?? action,
    },
    output: {
      action,
      message,
      ...output,
    },
  };
}
