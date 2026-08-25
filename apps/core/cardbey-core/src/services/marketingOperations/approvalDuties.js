/**
 * Minimal separation-of-duties for marketing approval.
 * Self-approve denied unless MARKETING_PILOT_ALLOW_SELF_APPROVE=true (audited override).
 */

export function allowSelfApproveOverride() {
  return String(process.env.MARKETING_PILOT_ALLOW_SELF_APPROVE || '').toLowerCase() === 'true';
}

/**
 * @param {{ createdBy?: string|null, actorId?: string|null, allowSelfApprove?: boolean }} input
 */
export function assertApprovalSeparation(input = {}) {
  const actorId = input.actorId ? String(input.actorId) : null;
  const createdBy = input.createdBy ? String(input.createdBy) : null;
  const allowSelf =
    input.allowSelfApprove === true || allowSelfApproveOverride();

  if (!actorId) {
    return { ok: false, error: 'approver_required' };
  }
  if (createdBy && actorId === createdBy && !allowSelf) {
    return {
      ok: false,
      error: 'self_approve_denied',
      message: 'Approver must differ from creator. Set MARKETING_PILOT_ALLOW_SELF_APPROVE=true for audited pilot override.',
    };
  }
  return {
    ok: true,
    actorId,
    createdBy,
    selfApproveOverride: Boolean(createdBy && actorId === createdBy && allowSelf),
  };
}

export function approvalStamp(actorId) {
  const now = new Date();
  return {
    reviewedBy: actorId ?? null,
    approvedBy: actorId ?? null,
    reviewedAt: now,
    approvedAt: now,
  };
}
