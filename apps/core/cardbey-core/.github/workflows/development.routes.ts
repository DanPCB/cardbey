// apps/core/cardbey-core/src/routes/development.routes.ts

import { Router } from 'express';
import { DevelopmentOrchestrator } from '../development/orchestrator/DevelopmentOrchestrator';

const router = Router();
const orchestrator = new DevelopmentOrchestrator();

// ===== MISSION CRUD =====

router.post('/development/mission', async (req, res) => {
  try {
    const mission = await orchestrator.createMission(req.body);
    res.json({ success: true, mission });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/development/mission/:id', async (req, res) => {
  try {
    const mission = await orchestrator.getMission(req.params.id);
    if (!mission) {
      return res.status(404).json({ success: false, error: 'Mission not found' });
    }
    res.json({ success: true, mission });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/development/missions', async (req, res) => {
  try {
    const missions = await orchestrator.listMissions();
    res.json({ success: true, missions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/development/mission/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    const mission = await orchestrator.cancelMission(req.params.id, reason);
    res.json({ success: true, mission });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== EVIDENCE =====

router.post('/development/mission/:id/evidence', async (req, res) => {
  try {
    const mission = await orchestrator.freezeEvidence(req.params.id, req.body);
    res.json({ success: true, mission });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== IMPACT ANALYSIS =====

router.post('/development/mission/:id/analyse', async (req, res) => {
  try {
    const report = await orchestrator.analyseImpact(req.params.id);
    res.json({ success: true, report });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== DESIGN =====

router.post('/development/mission/:id/design', async (req, res) => {
  try {
    const plan = await orchestrator.proposeDesign(req.params.id, req.body);
    res.json({ success: true, plan });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/development/mission/:id/design/approve', async (req, res) => {
  try {
    const { approver } = req.body;
    const mission = await orchestrator.approveDesign(req.params.id, approver);
    res.json({ success: true, mission });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== WORKSPACE =====

router.post('/development/mission/:id/workspace', async (req, res) => {
  try {
    const workspace = await orchestrator.prepareWorkspace(req.params.id);
    res.json({ success: true, workspace });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== IMPLEMENTATION =====

router.post('/development/mission/:id/implement', async (req, res) => {
  try {
    const patch = await orchestrator.implementChange(req.params.id);
    res.json({ success: true, patch });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== CHECKS =====

router.post('/development/mission/:id/checks', async (req, res) => {
  try {
    const checks = await orchestrator.runChecks(req.params.id);
    res.json({ success: true, checks });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== PULL REQUEST =====

router.post('/development/mission/:id/pr', async (req, res) => {
  try {
    const pr = await orchestrator.createPullRequest(req.params.id);
    res.json({ success: true, ...pr });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== STAGING =====

router.post('/development/mission/:id/staging', async (req, res) => {
  try {
    const deployment = await orchestrator.deployToStaging(req.params.id);
    res.json({ success: true, deployment });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/development/mission/:id/staging/verify', async (req, res) => {
  try {
    const deployment = await orchestrator.verifyStaging(req.params.id);
    res.json({ success: true, deployment });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== PRODUCTION =====

router.post('/development/mission/:id/release', async (req, res) => {
  try {
    const deployment = await orchestrator.requestProductionRelease(req.params.id);
    res.json({ success: true, deployment });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/development/mission/:id/release/verify', async (req, res) => {
  try {
    const mission = await orchestrator.verifyProduction(req.params.id);
    res.json({ success: true, mission });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== ROLLBACK =====

router.post('/development/mission/:id/rollback', async (req, res) => {
  try {
    const { reason } = req.body;
    const mission = await orchestrator.rollbackMission(req.params.id, reason);
    res.json({ success: true, mission });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== STATUS =====

router.get('/development/mission/:id/status', async (req, res) => {
  try {
    const mission = await orchestrator.getMission(req.params.id);
    if (!mission) {
      return res.status(404).json({ success: false, error: 'Mission not found' });
    }
    res.json({
      success: true,
      missionId: mission.id,
      state: mission.state,
      type: mission.type,
      riskLevel: mission.riskLevel
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;