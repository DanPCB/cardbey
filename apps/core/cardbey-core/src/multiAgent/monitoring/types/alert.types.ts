/**
 * Multi-agent alerting types.
 */

export enum AlertSeverity {
  CRITICAL = 'critical',
  WARNING = 'warning',
  INFO = 'info',
}

export enum AlertStatus {
  PENDING = 'pending',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
}

export enum AlertChannel {
  SLACK = 'slack',
  EMAIL = 'email',
  PAGERDUTY = 'pagerduty',
  WEBHOOK = 'webhook',
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  /** Dot-path on evaluation snapshot, e.g. metrics.successRate */
  condition: string;
  threshold: number;
  /** When true, alert fires when value is below threshold (e.g. success rate). */
  belowThreshold?: boolean;
  window: number;
  channels: AlertChannel[];
  cooldown: number;
  enabled: boolean;
  lastTriggered?: Date;
}

export interface Alert {
  id: string;
  ruleId: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  resolution?: string;
  notifications: Array<{
    channel: AlertChannel;
    sentAt: Date;
    success: boolean;
  }>;
}

export interface AlertConfig {
  rules: AlertRule[];
  channels: {
    slack?: {
      webhookUrl: string;
      channel: string;
    };
    email?: {
      recipients: string[];
      smtpConfig?: Record<string, unknown>;
    };
    pagerduty?: {
      integrationKey: string;
      serviceId: string;
    };
    webhook?: {
      url: string;
      headers: Record<string, string>;
    };
  };
}
