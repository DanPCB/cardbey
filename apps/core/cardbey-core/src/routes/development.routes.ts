import { Router, type Request, type Response, type NextFunction } from 'express';
import { getDevelopmentOrchestrator } from '../development/orchestrator/DevelopmentOrchestrator.js';
import { formatApiError, isDevelopmentError } from '../development/errors.js';
import { removeDevelopmentWorktree } from '../development/services/workspaceWorktree.js';

const router = Router();
const orchestrator = getDevelopmentOrchestrator();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

router.get('/development/ping', (_req, res) => {
  res.json({ success: true, message: 'Development routes are working!', timestamp: new Date().toISOString() });
});

router.get('/development/missions', (_req, res) => {
  res.json({ success: true, missions: orchestrator.listMissions() });
});

router.post('/development/mission', asyncHandler(async (req, res) => {
  const { type, repositoryId, baseBranch, title, request, expectedOutcome, observedBehaviour, requestedBy, executionMode } = req.body;
  if (!title || !request || !expectedOutcome || !requestedBy) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Missing required fields: title, request, expectedOutcome, requestedBy' },
    });
    return;
  }
  const mission = await orchestrator.createMission({
    type,
    repositoryId,
    baseBranch,
    title,
    request,
    expectedOutcome,
    observedBehaviour,
    requestedBy,
    executionMode,
  });
  res.json({ success: true, mission });
}));

router.get('/development/mission/:id', asyncHandler(async (req, res) => {
  const mission = await orchestrator.getMission(req.params.id);
  if (!mission) {
    res.status(404).json({ success: false, error: { code: 'MISSION_NOT_FOUND', message: 'Mission not found' } });
    return;
  }
  res.json({
    success: true,
    mission,
    impactReport: orchestrator.getImpactReport(req.params.id),
    design: orchestrator.getLatestDesign(req.params.id),
    workspace: orchestrator.getWorkspace(req.params.id),
    patch: orchestrator.getLatestPatch(req.params.id),
    checks: orchestrator.getCheckRuns(req.params.id),
    reviews: orchestrator.getReviews(req.params.id),
    pullRequest: orchestrator.getPullRequest(req.params.id),
  });
}));

router.get('/development/mission/:id/status', asyncHandler(async (req, res) => {
  const mission = await orchestrator.getMission(req.params.id);
  if (!mission) {
    res.status(404).json({ success: false, error: { code: 'MISSION_NOT_FOUND', message: 'Mission not found' } });
    return;
  }
  res.json({
    success: true,
    missionId: mission.id,
    state: mission.state,
    type: mission.type,
    riskLevel: mission.riskLevel,
    title: mission.title,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
  });
}));

router.post('/development/mission/:id/cancel', asyncHandler(async (req, res) => {
  const mission = await orchestrator.cancelMission(req.params.id, req.body.reason || 'Cancelled', req.body.actorId || 'user');
  res.json({ success: true, mission });
}));

router.post('/development/mission/:id/evidence', asyncHandler(async (req, res) => {
  const mission = await orchestrator.freezeEvidence(req.params.id, req.body, req.body.frozenBy || 'user');
  res.json({ success: true, mission });
}));

router.post('/development/mission/:id/analyse', asyncHandler(async (req, res) => {
  const report = await orchestrator.analyseImpact(req.params.id, req.body.actorId || 'system');
  const mission = await orchestrator.getMission(req.params.id);
  res.json({ success: true, report, mission });
}));

router.get('/development/mission/:id/impact', asyncHandler(async (req, res) => {
  const report = orchestrator.getImpactReport(req.params.id);
  if (!report) {
    res.status(404).json({ success: false, error: { code: 'IMPACT_NOT_FOUND', message: 'Impact report not found' } });
    return;
  }
  res.json({ success: true, report });
}));

router.post('/development/mission/:id/design', asyncHandler(async (req, res) => {
  const design = await orchestrator.proposeDesign(req.params.id, req.body.proposedBy || 'system');
  const mission = await orchestrator.getMission(req.params.id);
  res.json({ success: true, design, mission });
}));

router.get('/development/mission/:id/design', asyncHandler(async (req, res) => {
  const design = orchestrator.getLatestDesign(req.params.id);
  if (!design) {
    res.status(404).json({ success: false, error: { code: 'DESIGN_NOT_FOUND', message: 'Design not found' } });
    return;
  }
  res.json({ success: true, design, reviews: orchestrator.getReviews(req.params.id).filter((r) => r.type === 'DESIGN') });
}));

router.post('/development/mission/:id/design/approve', asyncHandler(async (req, res) => {
  const { approverUserId, approver, note, designVersion } = req.body;
  const mission = await orchestrator.approveDesign(req.params.id, {
    approverUserId: approverUserId || approver || 'user',
    note,
    designVersion: designVersion ?? orchestrator.getLatestDesign(req.params.id)?.version ?? 1,
  });
  res.json({ success: true, mission });
}));

router.post('/development/mission/:id/design/request-changes', asyncHandler(async (req, res) => {
  const { reason, actorId } = req.body;
  if (!reason) {
    res.status(400).json({ success: false, error: { code: 'REASON_REQUIRED', message: 'Reason is required' } });
    return;
  }
  const mission = await orchestrator.requestDesignChanges(req.params.id, reason, actorId || 'user');
  res.json({ success: true, mission });
}));

router.post('/development/mission/:id/design/reject', asyncHandler(async (req, res) => {
  const { reason, actorId } = req.body;
  if (!reason) {
    res.status(400).json({ success: false, error: { code: 'REASON_REQUIRED', message: 'Reason is required' } });
    return;
  }
  const mission = await orchestrator.rejectDesign(req.params.id, reason, actorId || 'user');
  res.json({ success: true, mission });
}));

router.post('/development/mission/:id/workspace/prepare', asyncHandler(async (req, res) => {
  const workspace = await orchestrator.prepareWorkspace(req.params.id, req.body.actorId || 'system');
  const mission = await orchestrator.getMission(req.params.id);
  res.json({ success: true, workspace, mission });
}));

router.get('/development/mission/:id/workspace', asyncHandler(async (req, res) => {
  const workspace = orchestrator.getWorkspace(req.params.id);
  if (!workspace) {
    res.status(404).json({ success: false, error: { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' } });
    return;
  }
  res.json({ success: true, workspace });
}));

router.delete('/development/mission/:id/workspace', asyncHandler(async (req, res) => {
  const workspace = orchestrator.getWorkspace(req.params.id);
  if (!workspace) {
    res.status(404).json({ success: false, error: { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' } });
    return;
  }
  await removeDevelopmentWorktree(workspace.path, workspace.branch);
  res.json({ success: true });
}));

router.post('/development/mission/:id/implement', asyncHandler(async (req, res) => {
  const mission = await orchestrator.getMission(req.params.id);
  if (!mission) {
    res.status(404).json({ success: false, error: { code: 'MISSION_NOT_FOUND', message: 'Mission not found' } });
    return;
  }
  const patch = await orchestrator.implementChange(req.params.id, {
    approvedDesignId: req.body.approvedDesignId || mission.approvedDesignId!,
    approvedDesignVersion: req.body.approvedDesignVersion ?? mission.approvedDesignVersion ?? 1,
  }, req.body.actorId || 'system');
  res.json({ success: true, patch, mission: await orchestrator.getMission(req.params.id) });
}));

router.get('/development/mission/:id/patch', asyncHandler(async (req, res) => {
  const patch = orchestrator.getLatestPatch(req.params.id);
  if (!patch) {
    res.status(404).json({ success: false, error: { code: 'PATCH_NOT_FOUND', message: 'Patch not found' } });
    return;
  }
  const fileChanges = orchestrator.getFileChanges(patch.id);
  res.json({ success: true, patch, fileChanges });
}));

router.get('/development/mission/:id/diff', asyncHandler(async (req, res) => {
  const patch = orchestrator.getLatestPatch(req.params.id);
  if (!patch) {
    res.status(404).json({ success: false, error: { code: 'PATCH_NOT_FOUND', message: 'Patch not found' } });
    return;
  }
  res.json({ success: true, diff: patch.diff });
}));

router.post('/development/mission/:id/checks/run', asyncHandler(async (req, res) => {
  const checks = await orchestrator.runChecks(req.params.id, req.body.actorId || 'system');
  const mission = await orchestrator.getMission(req.params.id);
  res.json({ success: true, checks, mission });
}));

router.get('/development/mission/:id/checks', asyncHandler(async (req, res) => {
  res.json({ success: true, checks: orchestrator.getCheckRuns(req.params.id) });
}));

router.post('/development/mission/:id/patch/approve', asyncHandler(async (req, res) => {
  const { reviewerUserId, reviewer, note, patchVersion } = req.body;
  const mission = await orchestrator.approvePatch(req.params.id, {
    reviewerUserId: reviewerUserId || reviewer || 'user',
    note,
    patchVersion: patchVersion ?? 1,
  });
  res.json({ success: true, mission });
}));

router.post('/development/mission/:id/pull-request', asyncHandler(async (req, res) => {
  const pr = await orchestrator.openPullRequest(req.params.id, req.body.actorId || 'user');
  if (pr.errorCode === 'GITHUB_INTEGRATION_NOT_CONFIGURED') {
    res.json({
      success: false,
      code: 'GITHUB_INTEGRATION_NOT_CONFIGURED',
      missionState: 'READY_FOR_PR',
      pullRequest: pr,
    });
    return;
  }
  res.json({ success: true, pullRequest: pr, mission: await orchestrator.getMission(req.params.id) });
}));

router.get('/development/mission/:id/pull-request', asyncHandler(async (req, res) => {
  const pullRequest = orchestrator.getPullRequest(req.params.id);
  if (!pullRequest) {
    res.status(404).json({ success: false, error: { code: 'PR_NOT_FOUND', message: 'Pull request not found' } });
    return;
  }
  res.json({ success: true, pullRequest });
}));

router.get('/development/mission/:id/events', asyncHandler(async (req, res) => {
  res.json({ success: true, events: orchestrator.getEvents(req.params.id) });
}));

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  if (isDevelopmentError(err)) {
    res.status(err.statusCode).json(formatApiError(err));
    return;
  }
  res.status(500).json(formatApiError(err));
});

export default router;
