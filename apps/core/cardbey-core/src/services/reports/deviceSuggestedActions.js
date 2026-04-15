/**
 * Device Suggested Actions
 * 
 * Helper functions for generating structured action suggestions
 * for daily device reports.
 */

import { buildInsightAction } from "../../utils/insightActionBuilder.js";

/**
 * Build suggested actions for device reports
 * 
 * @param params - Parameters for building actions
 * @param params.tenantId - Tenant ID
 * @param params.deviceId - Device ID
 * @returns Array of insight objects with actions
 */
export function buildDeviceSuggestedActions(params) {
  const { tenantId, deviceId } = params;

  return [
    {
      id: `dev_health_${deviceId}`,
      title: "Run Device Health Check",
      body: "Investigate the lack of heartbeats to ensure the device is functioning correctly.",
      action: buildInsightAction({
        description: "Check why heartbeats are missing and propose fixes.",
        entryPoint: "device_health_check",
        payload: { tenantId, deviceId, scope: "device", lookbackMinutes: 60 },
        navigation: { href: "/dashboard/devices/health", label: "Open Devices" },
        source: "report",
      }),
    },
    {
      id: `dev_playlist_${deviceId}`,
      title: "Audit Playlist Assignments",
      body: "Review whether frequent playlist assignments indicate misconfiguration.",
      action: buildInsightAction({
        description: "Audit playlist assignment frequency.",
        entryPoint: "playlist_assignment_audit",
        payload: { tenantId, deviceId, windowHours: 24 },
        navigation: { href: "/dashboard/playlists", label: "View Playlists" },
        source: "report",
      }),
    },
    {
      id: `dev_maintenance_${deviceId}`,
      title: "Schedule Maintenance",
      body: "Consider setting regular maintenance reminders.",
      action: buildInsightAction({
        description: "Create a maintenance schedule.",
        entryPoint: "device_maintenance_plan",
        payload: { tenantId, deviceId, frequencyDays: 14 },
        navigation: { href: "/dashboard/devices/maintenance", label: "Maintenance" },
        source: "report",
      }),
    },
  ];
}

