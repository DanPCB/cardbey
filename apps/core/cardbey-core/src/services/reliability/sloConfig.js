/**
 * SLO Configuration (P6).
 */

import sloTracker from './sloTracker.js';

sloTracker.define({
  name: 'api_success_rate',
  metric: 'success_rate',
  target: { operator: 'gte', value: 95 },
  window: '24h',
  severity: 'critical',
});

sloTracker.define({
  name: 'api_latency_p95',
  metric: 'latency_p95',
  target: { operator: 'lte', value: 5000 },
  window: '24h',
  severity: 'high',
});

sloTracker.define({
  name: 'queue_depth',
  metric: 'queue_depth',
  target: { operator: 'lt', value: 50 },
  window: '1h',
  severity: 'medium',
});
