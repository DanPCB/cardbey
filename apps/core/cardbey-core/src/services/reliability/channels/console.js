/**
 * Console Notification Channel (P6).
 */

export class ConsoleChannel {
  async send(alert) {
    const prefix =
      alert.severity === 'critical'
        ? '[CRITICAL]'
        : alert.severity === 'high'
          ? '[HIGH]'
          : alert.severity === 'medium'
            ? '[MEDIUM]'
            : '[LOW]';
    console.log(`[Alert] ${prefix} ${alert.title}: ${alert.message}`);
  }
}
