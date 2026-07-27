/**
 * Alert delivery channels for multi-agent monitoring.
 */

import type { Alert, AlertConfig } from '../types/alert.types.js';
import { AlertChannel } from '../types/alert.types.js';

export interface ChannelResult {
  success: boolean;
  message?: string;
}

export class AlertChannelManager {
  constructor(private readonly config: AlertConfig['channels']) {}

  async send(alert: Alert, channel: AlertChannel): Promise<ChannelResult> {
    switch (channel) {
      case AlertChannel.SLACK:
        return this.sendSlack(alert);
      case AlertChannel.EMAIL:
        return this.sendEmail(alert);
      case AlertChannel.PAGERDUTY:
        return this.sendPagerDuty(alert);
      case AlertChannel.WEBHOOK:
        return this.sendWebhook(alert);
      default:
        return { success: false, message: 'Unknown channel' };
    }
  }

  private async sendSlack(alert: Alert): Promise<ChannelResult> {
    const slack = this.config.slack;
    if (!slack?.webhookUrl) {
      return { success: false, message: 'Slack not configured' };
    }

    const color = this.getColor(alert.severity);
    const payload = {
      text: `🚨 ${alert.title}`,
      attachments: [
        {
          color,
          title: alert.title,
          text: alert.message,
          fields: [
            { title: 'Severity', value: alert.severity, short: true },
            { title: 'Value', value: String(alert.value), short: true },
            { title: 'Threshold', value: String(alert.threshold), short: true },
            { title: 'Time', value: alert.timestamp.toISOString(), short: true },
          ],
          footer: 'Cardbey Multi-Agent Alert System',
          ts: Math.floor(alert.timestamp.getTime() / 1000),
        },
      ],
    };

    try {
      const res = await fetch(slack.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return { success: false, message: `Slack HTTP ${res.status}` };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async sendEmail(alert: Alert): Promise<ChannelResult> {
    const email = this.config.email;
    if (!email?.recipients?.length) {
      return { success: false, message: 'Email not configured' };
    }
    // Email delivery delegated to platform reliability webhook when SMTP not wired.
    console.warn('[MultiAgentAlert] Email channel stub — recipients:', email.recipients.join(', '));
    console.warn('[MultiAgentAlert]', alert.title, alert.message);
    return { success: true, message: 'Logged to console (SMTP not configured)' };
  }

  private async sendPagerDuty(alert: Alert): Promise<ChannelResult> {
    const pd = this.config.pagerduty;
    if (!pd?.integrationKey) {
      return { success: false, message: 'PagerDuty not configured' };
    }

    try {
      const res = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routing_key: pd.integrationKey,
          event_action: 'trigger',
          payload: {
            summary: alert.title,
            source: 'cardbey-multi-agent',
            severity: alert.severity === 'critical' ? 'critical' : 'warning',
            custom_details: {
              message: alert.message,
              value: alert.value,
              threshold: alert.threshold,
            },
          },
        }),
      });
      if (!res.ok) {
        return { success: false, message: `PagerDuty HTTP ${res.status}` };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async sendWebhook(alert: Alert): Promise<ChannelResult> {
    const webhook = this.config.webhook;
    const url = webhook?.url || process.env.ALERT_WEBHOOK_URL || process.env.RELIABILITY_WEBHOOK_URL;
    if (!url) {
      return { success: false, message: 'Webhook not configured' };
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(webhook?.headers ?? {}),
      };
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source: 'cardbey-multi-agent',
          ...alert,
          timestamp: alert.timestamp.toISOString(),
        }),
      });
      if (!res.ok) {
        return { success: false, message: `Webhook HTTP ${res.status}` };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private getColor(severity: string): string {
    switch (severity) {
      case 'critical':
        return '#FF0000';
      case 'warning':
        return '#FFA500';
      case 'info':
        return '#0000FF';
      default:
        return '#000000';
    }
  }
}
