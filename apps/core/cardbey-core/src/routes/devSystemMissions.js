import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  guardCodeTaskExecution,
  GuardCodeTaskExecutionError,
} from '../services/codeExecution/guardCodeTaskExecution.js';
import {
  approveDevSystemProposal,
  createGuardedCodeTaskProposal,
  DevSystemProposalReviewError,
  getDevSystemProposalById,
  listDevSystemProposals,
  rejectDevSystemProposal,
} from '../services/codeExecution/devSystemProposalService.js';
import {
  createDryRunExecutionPreview,
  DevSystemDryRunError,
} from '../services/codeExecution/dryRunExecutionPreviewService.js';
import {
  listSecurityEvents,
  markSecurityEventRead,
  recordSecurityEvent,
  SecurityEventSeverity,
  SecurityEventType,
} from '../services/security/securityEventService.js';
import {
  PrivilegedVerificationError,
  PrivilegedVerificationMethod,
  readPrivilegedVerification,
  requireRecentPrivilegedVerification,
  verifyPrivilegedPassword,
} from '../services/security/privilegedVerificationService.js';
import { PrivilegedAction } from '../lib/privilegedActionPolicy.js';

const router = express.Router();

function getRequestContext(req) {
  const privilegedVerification = readPrivilegedVerification(req);
  return {
    route: req.originalUrl || req.path || null,
    ip: req.ip || null,
    userAgent: req.get?.('user-agent') || null,
    verificationContext: {
      recentVerificationAt: privilegedVerification.ok ? privilegedVerification.recentVerificationAt : null,
    },
  };
}

async function requireDevAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      ok: false,
      error: 'unauthorized',
      message: 'Authentication required',
    });
  }

  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  if (!isAdmin) {
    const route = req.originalUrl || req.path || null;
    await recordSecurityEvent({
      actor: req.user,
      type: route?.includes('/system-missions')
        ? SecurityEventType.ADMIN_GUARD_NON_ADMIN_ATTEMPT
        : SecurityEventType.ADMIN_DEV_CONSOLE_ACCESS_DENIED,
      severity: SecurityEventSeverity.HIGH,
      source: route?.includes('/system-missions') ? 'guard_layer' : 'dev_console',
      route,
      ip: req.ip || null,
      userAgent: req.get?.('user-agent') || null,
      details: {
        method: req.method,
        role: req.user?.role || null,
      },
    });

    return res.status(403).json({
      ok: false,
      error: 'forbidden',
      message: 'Platform admin access required',
    });
  }

  return next();
}

async function handleGuardError(req, res, error) {
  if (error instanceof GuardCodeTaskExecutionError) {
    let eventType = SecurityEventType.ADMIN_GUARD_INVALID_PAYLOAD;
    let severity = SecurityEventSeverity.WARNING;
    if (error.code === 'forbidden_allowed_path' || error.code === 'conflicting_scope') {
      eventType = SecurityEventType.ADMIN_GUARD_FORBIDDEN_PATH;
      severity = SecurityEventSeverity.HIGH;
    }

    await recordSecurityEvent({
      actor: req.user,
      type: eventType,
      severity,
      source: 'guard_layer',
      route: req.originalUrl || req.path || null,
      ip: req.ip || null,
      userAgent: req.get?.('user-agent') || null,
      details: {
        code: error.code || 'guard_failed',
        message: error.message || 'Request rejected by guard layer',
        details: error.details || null,
      },
    });

    return res.status(error.status || 400).json({
      ok: false,
      error: error.code || 'guard_failed',
      message: error.message || 'Request rejected by guard layer',
      details: error.details || undefined,
    });
  }

  console.error('[devSystemMissions] code-task request failed:', error?.message || error);
  return res.status(500).json({
    ok: false,
    error: 'internal_error',
    message: 'Unable to evaluate code task request',
  });
}

function handleReviewError(res, error) {
  if (error instanceof PrivilegedVerificationError) {
    return res.status(error.status || 403).json({
      ok: false,
      error: error.code || 'privileged_verification_required',
      message: error.message,
      details: error.details || undefined,
    });
  }

  if (error instanceof DevSystemProposalReviewError) {
    return res.status(error.status || 400).json({
      ok: false,
      error: error.code || 'invalid_review_state',
      message: error.message,
      details: error.details || undefined,
    });
  }

  console.error('[devSystemMissions] proposal review failed:', error?.message || error);
  return res.status(500).json({
    ok: false,
    error: 'internal_error',
    message: 'Unable to review proposal',
  });
}

function handleDryRunError(res, error) {
  if (error instanceof PrivilegedVerificationError) {
    return res.status(error.status || 403).json({
      ok: false,
      error: error.code || 'privileged_verification_required',
      message: error.message,
      details: error.details || undefined,
    });
  }

  if (error instanceof DevSystemDryRunError) {
    return res.status(error.status || 400).json({
      ok: false,
      error: error.code || 'dry_run_failed',
      message: error.message,
      details: error.details || undefined,
    });
  }

  console.error('[devSystemMissions] dry-run preview failed:', error?.message || error);
  return res.status(500).json({
    ok: false,
    error: 'internal_error',
    message: 'Unable to generate dry-run preview',
  });
}

router.post('/privileged/verify', requireAuth, requireDevAdmin, async (req, res) => {
  try {
    const method = req.body?.method;
    if (method !== PrivilegedVerificationMethod.PASSWORD_RECONFIRM) {
      return res.status(400).json({
        ok: false,
        error: 'unsupported_verification_method',
        message: 'Only password re-confirmation is supported in this phase',
      });
    }

    const result = await verifyPrivilegedPassword({
      req,
      res,
      actor: req.user,
      password: req.body?.password,
      requestContext: getRequestContext(req),
      action: PrivilegedAction.DEV_SYSTEM_PROPOSAL_REVIEW,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleReviewError(res, error);
  }
});

router.post('/system-missions/code-task', requireAuth, requireDevAdmin, async (req, res) => {
  try {
    const result = guardCodeTaskExecution({
      actor: req.user,
      payload: req.body ?? {},
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleGuardError(req, res, error);
  }
});

router.post('/system-missions/code-task/proposals', requireAuth, requireDevAdmin, async (req, res) => {
  try {
    const result = await createGuardedCodeTaskProposal({
      actor: req.user,
      payload: req.body ?? {},
      requestContext: getRequestContext(req),
    });

    return res.status(201).json(result);
  } catch (error) {
    return handleGuardError(req, res, error);
  }
});

router.get('/system-missions/code-task/proposals', requireAuth, requireDevAdmin, async (req, res) => {
  try {
    const result = await listDevSystemProposals({ limit: req.query.limit });
    return res.status(200).json(result);
  } catch (error) {
    console.error('[devSystemMissions] list proposals failed:', error?.message || error);
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: 'Unable to load proposal records',
    });
  }
});

router.get('/system-missions/code-task/proposals/:id', requireAuth, requireDevAdmin, async (req, res) => {
  try {
    const proposal = await getDevSystemProposalById(String(req.params.id || '').trim());
    if (!proposal) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Proposal not found',
      });
    }

    return res.status(200).json({
      ok: true,
      proposal,
    });
  } catch (error) {
    console.error('[devSystemMissions] read proposal failed:', error?.message || error);
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: 'Unable to load proposal record',
    });
  }
});

router.post('/system-missions/code-task/proposals/:id/approve', requireAuth, requireDevAdmin, async (req, res) => {
  try {
    await requireRecentPrivilegedVerification({
      req,
      res,
      actor: req.user,
      action: PrivilegedAction.DEV_SYSTEM_PROPOSAL_REVIEW,
      requestContext: getRequestContext(req),
    });

    const result = await approveDevSystemProposal({
      proposalId: String(req.params.id || '').trim(),
      actor: req.user,
      reason: req.body?.reason,
      requestContext: getRequestContext(req),
    });
    return res.status(200).json(result);
  } catch (error) {
    return handleReviewError(res, error);
  }
});

router.post('/system-missions/code-task/proposals/:id/reject', requireAuth, requireDevAdmin, async (req, res) => {
  try {
    await requireRecentPrivilegedVerification({
      req,
      res,
      actor: req.user,
      action: PrivilegedAction.DEV_SYSTEM_PROPOSAL_REVIEW,
      requestContext: getRequestContext(req),
    });

    const result = await rejectDevSystemProposal({
      proposalId: String(req.params.id || '').trim(),
      actor: req.user,
      reason: req.body?.reason,
      requestContext: getRequestContext(req),
    });
    return res.status(200).json(result);
  } catch (error) {
    return handleReviewError(res, error);
  }
});

router.post('/system-missions/code-task/proposals/:id/dry-run', requireAuth, requireDevAdmin, async (req, res) => {
  const requestContext = getRequestContext(req);
  try {
    await requireRecentPrivilegedVerification({
      req,
      res,
      actor: req.user,
      action: PrivilegedAction.DEV_SYSTEM_EXECUTION_TRIGGER,
      requestContext,
    });

    const result = await createDryRunExecutionPreview({
      proposalId: String(req.params.id || '').trim(),
      actor: req.user,
      engineOverride: req.body?.engine,
      requestContext,
    });

    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof PrivilegedVerificationError) {
      await recordSecurityEvent({
        actor: req.user,
        type: SecurityEventType.ADMIN_EXECUTION_DRY_RUN_VERIFICATION_REQUIRED,
        severity: SecurityEventSeverity.WARNING,
        source: 'dry_run',
        route: requestContext?.route ?? null,
        ip: requestContext?.ip ?? null,
        userAgent: requestContext?.userAgent ?? null,
        details: {
          proposalId: String(req.params.id || '').trim(),
          reason: error.details?.reason || null,
        },
      });
    }
    return handleDryRunError(res, error);
  }
});

router.get('/security-events', requireAuth, requireDevAdmin, async (req, res) => {
  try {
    const result = await listSecurityEvents({ limit: req.query.limit });
    return res.status(200).json(result);
  } catch (error) {
    console.error('[devSystemMissions] list security events failed:', error?.message || error);
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: 'Unable to load security events',
    });
  }
});

router.post('/security-events/:id/read', requireAuth, requireDevAdmin, async (req, res) => {
  try {
    const event = await markSecurityEventRead(String(req.params.id || '').trim());
    return res.status(200).json({
      ok: true,
      event,
    });
  } catch (error) {
    console.error('[devSystemMissions] mark security event read failed:', error?.message || error);
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: 'Unable to update security event',
    });
  }
});

export default router;
