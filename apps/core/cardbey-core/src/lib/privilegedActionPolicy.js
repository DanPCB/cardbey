export const PrivilegedAction = Object.freeze({
  DEV_SYSTEM_PROPOSAL_SUBMIT: 'dev_system_proposal_submit',
  DEV_SYSTEM_PROPOSAL_REVIEW: 'dev_system_proposal_review',
  DEV_SYSTEM_EXECUTION_TRIGGER: 'dev_system_execution_trigger',
  DEV_SYSTEM_APPROVAL_OVERRIDE: 'dev_system_approval_override',
  FUTURE_DEV_SYSTEM_EXECUTION_TRIGGER: 'future_dev_system_execution_trigger',
  FUTURE_DEV_SYSTEM_APPROVAL_OVERRIDE: 'future_dev_system_approval_override',
});

const POLICY = Object.freeze({
  [PrivilegedAction.DEV_SYSTEM_PROPOSAL_SUBMIT]: {
    requiresAdmin: true,
    requiresRecentPrivilegedVerification: false,
    maxAgeSeconds: null,
    verificationMethod: 'existing_admin_auth',
    notes: 'Step-up not enforced yet; future WebAuthn/passkey primary, TOTP fallback.',
  },
  [PrivilegedAction.DEV_SYSTEM_PROPOSAL_REVIEW]: {
    requiresAdmin: true,
    requiresRecentPrivilegedVerification: true,
    maxAgeSeconds: 600,
    verificationMethod: 'password_reconfirm',
    notes: 'Current sensitive review action requires recent privileged step-up verification.',
  },
  [PrivilegedAction.DEV_SYSTEM_EXECUTION_TRIGGER]: {
    requiresAdmin: true,
    requiresRecentPrivilegedVerification: true,
    maxAgeSeconds: 600,
    verificationMethod: 'future_step_up_required',
    notes: 'Reserved for future real execution flow.',
  },
  [PrivilegedAction.DEV_SYSTEM_APPROVAL_OVERRIDE]: {
    requiresAdmin: true,
    requiresRecentPrivilegedVerification: true,
    maxAgeSeconds: 600,
    verificationMethod: 'future_step_up_required',
    notes: 'Reserved for future override flow.',
  },
  [PrivilegedAction.FUTURE_DEV_SYSTEM_EXECUTION_TRIGGER]: {
    requiresAdmin: true,
    requiresRecentPrivilegedVerification: true,
    maxAgeSeconds: 600,
    verificationMethod: 'future_step_up_required',
    notes: 'Reserved for future real execution flow.',
  },
  [PrivilegedAction.FUTURE_DEV_SYSTEM_APPROVAL_OVERRIDE]: {
    requiresAdmin: true,
    requiresRecentPrivilegedVerification: true,
    maxAgeSeconds: 600,
    verificationMethod: 'future_step_up_required',
    notes: 'Reserved for future override flow.',
  },
});

export function getPrivilegedActionPolicy(action) {
  return POLICY[action] ?? null;
}

export function evaluatePrivilegedAction({ action, actor, verificationContext } = {}) {
  const policy = getPrivilegedActionPolicy(action);
  if (!policy) {
    return {
      ok: false,
      action,
      reason: 'unknown_action',
      policy: null,
    };
  }

  const isAdmin = actor?.role === 'admin' || actor?.role === 'super_admin';
  if (policy.requiresAdmin && !isAdmin) {
    return {
      ok: false,
      action,
      reason: 'admin_required',
      policy,
    };
  }

  const recentVerificationAt = verificationContext?.recentVerificationAt ?? null;
  const maxAgeSeconds = policy.maxAgeSeconds ?? null;
  const verifiedAtMs = recentVerificationAt ? new Date(recentVerificationAt).getTime() : NaN;
  const withinWindow =
    policy.requiresRecentPrivilegedVerification && Number.isFinite(verifiedAtMs) && maxAgeSeconds
      ? Date.now() - verifiedAtMs <= maxAgeSeconds * 1000
      : !policy.requiresRecentPrivilegedVerification;
  return {
    ok: true,
    action,
    policy,
    verification: {
      requiredNow: policy.requiresRecentPrivilegedVerification,
      satisfiedNow: policy.requiresRecentPrivilegedVerification ? withinWindow : true,
      recentVerificationAt,
      maxAgeSeconds,
      mode: policy.verificationMethod,
    },
  };
}
