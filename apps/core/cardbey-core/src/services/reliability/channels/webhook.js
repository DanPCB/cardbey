/**
 * Webhook Notification Channel (P6).
 */

export class WebhookChannel {
  /**
   * @param {string} url
   * @param {{ fetchImpl?: typeof fetch }} [options]
   */
  constructor(url, options = {}) {
    this.url = url;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async send(alert) {
    const response = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
    });
    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }
  }
}
