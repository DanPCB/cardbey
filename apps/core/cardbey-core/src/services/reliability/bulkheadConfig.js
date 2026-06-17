/**
 * Bulkhead Configuration (P6).
 */

import bulkhead from './bulkhead.js';

bulkhead.configure({
  name: 'skill_execution',
  maxConcurrent: 10,
  maxQueueSize: 20,
  timeoutMs: 60_000,
});

bulkhead.configure({
  name: 'agent_execution',
  maxConcurrent: 5,
  maxQueueSize: 10,
  timeoutMs: 120_000,
});

bulkhead.configure({
  name: 'memory_operations',
  maxConcurrent: 20,
  maxQueueSize: 50,
  timeoutMs: 10_000,
});

bulkhead.configure({
  name: 'llm_operations',
  maxConcurrent: 3,
  maxQueueSize: 10,
  timeoutMs: 30_000,
});
