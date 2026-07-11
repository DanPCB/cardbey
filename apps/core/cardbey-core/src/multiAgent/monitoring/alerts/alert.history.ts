/**
 * In-memory alert history for multi-agent monitoring.
 */

import type { Alert, AlertStatus } from '../types/alert.types.js';

const MAX_ALERTS = 1000;
const alerts: Alert[] = [];

export function storeAlert(alert: Alert): void {
  alerts.push(alert);
  if (alerts.length > MAX_ALERTS) {
    alerts.splice(0, alerts.length - MAX_ALERTS);
  }
}

export function getAlerts(filter: {
  status?: string;
  severity?: string;
  limit?: number;
} = {}): Alert[] {
  let rows = [...alerts].reverse();
  if (filter.status) {
    rows = rows.filter((a) => a.status === filter.status);
  }
  if (filter.severity) {
    rows = rows.filter((a) => a.severity === filter.severity);
  }
  const limit = filter.limit ?? 50;
  return rows.slice(0, limit);
}

export function findAlert(alertId: string): Alert | undefined {
  return alerts.find((a) => a.id === alertId);
}

export function updateAlertStatus(
  alertId: string,
  status: AlertStatus,
  patch: Partial<Alert> = {},
): Alert | null {
  const alert = findAlert(alertId);
  if (!alert) return null;
  alert.status = status;
  Object.assign(alert, patch);
  return alert;
}

export function resetAlertHistoryForTests(): void {
  alerts.length = 0;
}
