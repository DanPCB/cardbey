/**
 * Public monitoring API (multi-agent DeepSeek pipeline).
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

async function getMonitoring() {
  const mod = await import('../multiAgent/monitoring/index.ts');
  return mod.initMultiAgentMonitoring();
}

router.get('/dashboard', async (req, res) => {
  try {
    const { metricsStore } = await getMonitoring();
    const timeRange = String(req.query.timeRange ?? '24h');
    const data = metricsStore.getDashboardData(timeRange);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || 'Dashboard error' });
  }
});

router.get('/health', async (_req, res) => {
  try {
    const { metricsStore } = await getMonitoring();
    const data = metricsStore.getSystemHealth();
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || 'Health error' });
  }
});

router.get('/mission/:missionId', async (req, res) => {
  try {
    const { metricsStore } = await getMonitoring();
    const metrics = metricsStore.getMissionMetrics(req.params.missionId);
    if (!metrics) {
      return res.status(404).json({ success: false, error: 'Mission metrics not found' });
    }
    return res.json({ success: true, data: metrics });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || 'Mission metrics error' });
  }
});

router.get('/prometheus', async (_req, res) => {
  try {
    const { metricsStore } = await getMonitoring();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return res.send(metricsStore.getPrometheusMetrics());
  } catch (error) {
    return res.status(500).send('# monitoring prometheus error\n');
  }
});

router.post('/alerts/test', async (req, res) => {
  try {
    const { alertManager } = await getMonitoring();
    const severity = String(req.body?.severity ?? 'warning').toLowerCase();
    const message = String(req.body?.message ?? 'Test alert from monitoring API');
    const alert = await alertManager.triggerManualAlert({
      ruleId: 'monitoring_test_alert',
      severity:
        severity === 'critical'
          ? 'critical'
          : severity === 'info'
            ? 'info'
            : 'warning',
      title: 'Monitoring Test Alert',
      message,
      value: 1,
      threshold: 0,
    });
    return res.json({ success: true, data: alert });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || 'Test alert error' });
  }
});

router.get('/alerts', async (req, res) => {
  try {
    const { alertManager } = await getMonitoring();
    const data = alertManager.getAlerts({
      status: req.query.status ? String(req.query.status) : undefined,
      severity: req.query.severity ? String(req.query.severity) : undefined,
      limit: parseInt(String(req.query.limit ?? '50'), 10) || 50,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || 'Alerts error' });
  }
});

router.post('/alerts/:id/acknowledge', async (req, res) => {
  try {
    const { alertManager } = await getMonitoring();
    await alertManager.acknowledgeAlert(
      req.params.id,
      String(req.body?.userId ?? req.user?.id ?? 'admin'),
    );
    return res.json({ success: true, message: 'Alert acknowledged' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || 'Acknowledge error' });
  }
});

router.post('/alerts/:id/resolve', async (req, res) => {
  try {
    const { alertManager } = await getMonitoring();
    await alertManager.resolveAlert(
      req.params.id,
      String(req.body?.resolution ?? 'Manually resolved'),
    );
    return res.json({ success: true, message: 'Alert resolved' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || 'Resolve error' });
  }
});

router.get('/shadow/comparisons', async (req, res) => {
  try {
    const { metricsStore } = await getMonitoring();
    const data = metricsStore.getShadowComparisons({
      limit: parseInt(String(req.query.limit ?? '100'), 10) || 100,
      offset: parseInt(String(req.query.offset ?? '0'), 10) || 0,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || 'Shadow error' });
  }
});

export default router;
