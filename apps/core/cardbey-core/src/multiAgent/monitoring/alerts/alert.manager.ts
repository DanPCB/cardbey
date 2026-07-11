/**
 * Multi-agent alert evaluation engine.
 */

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import logger from '../../telemetry/logger.js';
import type { MultiAgentMetricsStore } from '../dashboard/metricsStore.js';
import {
  AlertChannel,
  AlertSeverity,
  AlertStatus,
  type Alert,
  type AlertConfig,
  type AlertRule,
} from '../types/alert.types.js';
import { AlertChannelManager } from './alert.channels.js';
import { getAlerts, storeAlert, updateAlertStatus } from './alert.history.js';
import { buildDefaultAlertRules } from './alert.rules.js';
import { multiAgentMetricsStore } from '../dashboard/metricsStore.js';
import { onMissionRecorded } from '../../telemetry/metrics.js';
import alerting from '../../../services/reliability/alerting.js';

function getPathValue(obj: Record<string, unknown>, path: string): number {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return 0;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'number' && Number.isFinite(cur) ? cur : 0;
}

export class AlertManager extends EventEmitter {
  private readonly channelManager: AlertChannelManager;
  private readonly lastTriggered = new Map<string, Date>();
  private evaluationInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly config: AlertConfig,
    private readonly metricsStore: MultiAgentMetricsStore,
  ) {
    super();
    this.channelManager = new AlertChannelManager(config.channels);
    this.startEvaluationInterval();
    onMissionRecorded(() => {
      void this.evaluateRules();
    });
  }

  async evaluateRules(): Promise<void> {
    if (process.env.MONITORING_ENABLED === 'false') return;

    for (const rule of this.config.rules) {
      if (!rule.enabled || this.isInCooldown(rule)) continue;
      try {
        const snapshot = this.metricsStore.getEvaluationSnapshot(rule.window);
        const value = getPathValue(snapshot, rule.condition);
        const shouldAlert = rule.belowThreshold
          ? value < rule.threshold
          : value > rule.threshold;
        if (shouldAlert) {
          await this.triggerAlert(rule, value);
        }
      } catch (error) {
        logger.error({
          message: `[AlertManager] Failed to evaluate rule ${rule.id}`,
          ruleId: rule.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async triggerAlert(rule: AlertRule, value: number): Promise<Alert> {
    const alert: Alert = {
      id: randomUUID(),
      ruleId: rule.id,
      severity: rule.severity,
      status: AlertStatus.PENDING,
      title: `[${rule.severity.toUpperCase()}] ${rule.name}`,
      message: rule.description,
      value,
      threshold: rule.threshold,
      timestamp: new Date(),
      notifications: [],
    };

    storeAlert(alert);
    this.lastTriggered.set(rule.id, new Date());
    rule.lastTriggered = alert.timestamp;

    await this.sendNotifications(alert, rule.channels);
    await alerting.sendAlert({
      title: alert.title,
      message: alert.message,
      severity: alert.severity,
      metadata: { source: 'multi-agent', ruleId: rule.id, value, threshold: rule.threshold },
    });

    logger.warn({
      message: `[AlertManager] Alert triggered: ${alert.title}`,
      alertId: alert.id,
      ruleId: rule.id,
      severity: alert.severity,
    });

    this.emit('alert:triggered', alert);
    return alert;
  }

  async triggerManualAlert(params: {
    ruleId?: string;
    severity?: AlertSeverity;
    title: string;
    message: string;
    value?: number;
    threshold?: number;
    channels?: AlertChannel[];
  }): Promise<Alert> {
    const rule: AlertRule = {
      id: params.ruleId ?? 'manual_alert',
      name: params.title,
      description: params.message,
      severity: params.severity ?? AlertSeverity.WARNING,
      condition: 'manual',
      threshold: params.threshold ?? 0,
      window: 0,
      channels:
        params.channels ??
        (['slack', 'webhook'] as AlertChannel[]),
      cooldown: 0,
      enabled: true,
    };
    return this.triggerAlert(rule, params.value ?? 1);
  }

  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    const alert = updateAlertStatus(alertId, AlertStatus.ACKNOWLEDGED, {
      acknowledgedBy: userId,
    });
    if (!alert) throw new Error(`Alert ${alertId} not found`);
    this.emit('alert:acknowledged', alert);
  }

  async resolveAlert(alertId: string, resolution: string): Promise<void> {
    const alert = updateAlertStatus(alertId, AlertStatus.RESOLVED, {
      resolvedAt: new Date(),
      resolution,
    });
    if (!alert) throw new Error(`Alert ${alertId} not found`);
    this.emit('alert:resolved', alert);
  }

  getAlerts(filter: {
    status?: string;
    severity?: string;
    limit?: number;
  } = {}): Alert[] {
    return getAlerts(filter);
  }

  private async sendNotifications(alert: Alert, channels: AlertChannel[]): Promise<void> {
    for (const channel of channels) {
      try {
        const result = await this.channelManager.send(alert, channel);
        alert.notifications.push({
          channel,
          sentAt: new Date(),
          success: result.success,
        });
      } catch (error) {
        alert.notifications.push({
          channel,
          sentAt: new Date(),
          success: false,
        });
        logger.error({
          message: `[AlertManager] Failed to send notification to ${channel}`,
          alertId: alert.id,
          channel,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private isInCooldown(rule: AlertRule): boolean {
    const last = this.lastTriggered.get(rule.id);
    if (!last) return false;
    return Date.now() - last.getTime() < rule.cooldown * 1000;
  }

  private startEvaluationInterval(): void {
    if (process.env.VITEST === 'true' || process.env.MONITORING_ENABLED === 'false') {
      return;
    }
    const intervalMs = Number.parseInt(process.env.METRICS_FLUSH_INTERVAL ?? '60000', 10) || 60000;
    this.evaluationInterval = setInterval(() => {
      void this.evaluateRules();
    }, intervalMs);
    if (typeof this.evaluationInterval.unref === 'function') {
      this.evaluationInterval.unref();
    }
  }

  destroy(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }
  }
}

let alertManagerInstance: AlertManager | null = null;

export function initMultiAgentMonitoring(): {
  metricsStore: MultiAgentMetricsStore;
  alertManager: AlertManager;
} {
  if (alertManagerInstance && multiAgentMetricsStoreRef) {
    return { metricsStore: multiAgentMetricsStoreRef, alertManager: alertManagerInstance };
  }

  const config: AlertConfig = {
    rules: buildDefaultAlertRules(),
    channels: {
      slack: {
        webhookUrl: process.env.SLACK_WEBHOOK_URL?.trim() ?? '',
        channel: process.env.SLACK_CHANNEL?.trim() || '#cardbey-alerts',
      },
      email: {
        recipients: (process.env.ALERT_EMAIL_RECIPIENTS ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        smtpConfig: {
          host: process.env.SMTP_HOST,
          port: Number.parseInt(process.env.SMTP_PORT ?? '587', 10),
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        },
      },
      pagerduty: {
        integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY?.trim() ?? '',
        serviceId: process.env.PAGERDUTY_SERVICE_ID?.trim() ?? '',
      },
      webhook: {
        url: process.env.ALERT_WEBHOOK_URL?.trim() ?? '',
        headers: {
          Authorization: `Bearer ${process.env.ALERT_WEBHOOK_TOKEN ?? ''}`,
        },
      },
    },
  };

  alertManagerInstance = new AlertManager(config, multiAgentMetricsStore);
  multiAgentMetricsStoreRef = multiAgentMetricsStore;
  return { metricsStore: multiAgentMetricsStore, alertManager: alertManagerInstance };
}

export function getMultiAgentAlertManager(): AlertManager | null {
  return alertManagerInstance;
}

let multiAgentMetricsStoreRef: MultiAgentMetricsStore | null = null;

export function getMultiAgentMetricsStore(): MultiAgentMetricsStore | null {
  return multiAgentMetricsStoreRef;
}

export function resetMultiAgentMonitoringForTests(): void {
  alertManagerInstance?.destroy();
  alertManagerInstance = null;
  multiAgentMetricsStoreRef = null;
}
