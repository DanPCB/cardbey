/**
 * Alerting Service — real-time notifications (P6).
 */

export class AlertingService {
  constructor() {
    /** @type {Map<string, { send: (alert: object) => Promise<void> }>} */
    this.channels = new Map();
    /** @type {Array<object>} */
    this.alerts = [];
    this.maxAlerts = 1000;
  }

  /**
   * @param {string} name
   * @param {{ send: (alert: object) => Promise<void> }} channel
   */
  registerChannel(name, channel) {
    this.channels.set(name, channel);
    console.log(`[Alerting] Registered channel: ${name}`);
  }

  /**
   * @param {{ title: string; message: string; severity?: string; metadata?: object }} alert
   */
  async sendAlert(alert) {
    const { title, message, severity = 'medium', metadata = {} } = alert;

    const formatted = {
      title,
      message,
      severity,
      metadata,
      timestamp: new Date().toISOString(),
    };

    this.alerts.push(formatted);
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.shift();
    }

    for (const [name, channel] of this.channels) {
      try {
        await channel.send(formatted);
        console.log(`[Alerting] Sent alert via ${name}`);
      } catch (error) {
        console.error(`[Alerting] Failed to send via ${name}:`, error?.message || error);
      }
    }

    return formatted;
  }

  getAlerts(limit = 50, severity = null) {
    let filtered = this.alerts;
    if (severity) {
      filtered = filtered.filter((a) => a.severity === severity);
    }
    return filtered.slice(-limit);
  }

  clearAlerts() {
    this.alerts = [];
  }

  resetForTests() {
    this.channels.clear();
    this.alerts = [];
  }
}

const alerting = new AlertingService();
export default alerting;
