/**
 * Reliability layer bootstrap (P6).
 */

import autoHeal from './autoHeal.js';
import sloTracker from './sloTracker.js';
import alerting from './alerting.js';
import { ConsoleChannel } from './channels/console.js';
import { WebhookChannel } from './channels/webhook.js';
import {
  initializeAgents,
  startAgentHeartbeatLoop,
  stopAgentHeartbeatLoop,
} from '../agents/agentLifecycle.js';

/** @type {ReturnType<typeof setInterval>|null} */
let sloInterval = null;
let initialized = false;

export function initReliabilityLayer() {
  if (initialized) return;
  initialized = true;

  alerting.registerChannel('console', new ConsoleChannel());

  const webhookUrl = process.env.RELIABILITY_WEBHOOK_URL?.trim();
  if (webhookUrl) {
    alerting.registerChannel('webhook', new WebhookChannel(webhookUrl));
  }

  if (process.env.VITEST !== 'true' && process.env.RELIABILITY_AUTO_HEAL !== 'false') {
    autoHeal.start();
  }

  if (process.env.VITEST !== 'true' && process.env.AGENT_AUTO_START !== 'false') {
    initializeAgents();
    startAgentHeartbeatLoop(
      parseInt(process.env.AGENT_HEARTBEAT_INTERVAL_MS, 10) || 30_000,
    );
  }

  if (process.env.VITEST !== 'true' && process.env.RELIABILITY_SLO_LOOP !== 'false') {
    const intervalMs = parseInt(process.env.SLO_EVAL_INTERVAL_MS, 10) || 60_000;
    const runSloEvaluation = () => {
      sloTracker
        .evaluate()
        .then(async (breaches) => {
          for (const breach of breaches) {
            await alerting.sendAlert({
              title: `SLO Breach: ${breach.name}`,
              message: `${breach.metric}=${breach.value} (target ${breach.target.operator} ${breach.target.value})`,
              severity: breach.severity,
              metadata: breach,
            });
          }
        })
        .catch((err) => {
          console.error('[SLO] Evaluation error:', err?.message || err);
        });
    };

    runSloEvaluation();

    sloInterval = setInterval(runSloEvaluation, intervalMs);
    if (typeof sloInterval?.unref === 'function') {
      sloInterval.unref();
    }
  }
}

export function shutdownReliabilityLayer() {
  autoHeal.stop();
  stopAgentHeartbeatLoop();
  if (sloInterval) {
    clearInterval(sloInterval);
    sloInterval = null;
  }
  initialized = false;
}
