/**
 * Device Orchestrator Handlers
 * 
 * Handles device-related insight actions:
 * - Device health checks
 * - Playlist assignment audits
 * - Device maintenance planning
 * - Alert setup for heartbeats
 * - Device monitoring reviews
 */

import { PrismaClient } from '@prisma/client';
import { OrchestratorContext } from '../insightTypes.js';
import {
  DeviceHealthCheckPayload,
  PlaylistAssignmentAuditPayload,
  DeviceMaintenancePlanPayload,
  DeviceAlertSetupHeartbeatsPayload,
  DeviceMonitoringReviewPayload,
} from '../insightTypes.js';
import { ActivityEventType } from '../../services/activityEventService.js';

const prisma = new PrismaClient();

// Health status thresholds (in minutes)
const HEALTHY_THRESHOLD_MINUTES = 5;
const DEGRADED_THRESHOLD_MINUTES = 15;
const OFFLINE_THRESHOLD_MINUTES = 60;

/**
 * Determine device health status based on lastSeenAt
 */
function determineHealthStatus(lastSeenAt: Date | null, lookbackMinutes: number): 'healthy' | 'degraded' | 'offline' {
  if (!lastSeenAt) {
    return 'offline';
  }

  const minutesSinceLastSeen = (Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60);
  
  if (minutesSinceLastSeen <= lookbackMinutes) {
    if (minutesSinceLastSeen <= HEALTHY_THRESHOLD_MINUTES) {
      return 'healthy';
    } else if (minutesSinceLastSeen <= DEGRADED_THRESHOLD_MINUTES) {
      return 'degraded';
    }
  }
  
  return 'offline';
}

/**
 * Handle device health check
 * 
 * Inspects device heartbeats for the given tenant/store/device
 * Returns summary of health status
 */
export async function handleDeviceHealthCheck(
  payload: DeviceHealthCheckPayload,
  context: OrchestratorContext
) {
  try {
    const { scope, tenantId, storeId, deviceId, lookbackMinutes = 60 } = payload;

    // Build where clause based on scope
    const where: any = { tenantId };
    if (scope === 'device' && deviceId) {
      where.id = deviceId;
    } else if (scope === 'store' && storeId) {
      where.storeId = storeId;
    }

    // Fetch devices
    const devices = await prisma.device.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        storeId: true,
        location: true,
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    // Determine health status for each device
    const deviceHealth = devices.map((device) => {
      const healthStatus = determineHealthStatus(device.lastSeenAt, lookbackMinutes);
      return {
        deviceId: device.id,
        name: device.name || device.id,
        status: device.status,
        healthStatus,
        lastSeenAt: device.lastSeenAt,
        location: device.location,
      };
    });

    const healthyCount = deviceHealth.filter((d) => d.healthStatus === 'healthy').length;
    const degradedCount = deviceHealth.filter((d) => d.healthStatus === 'degraded').length;
    const offlineCount = deviceHealth.filter((d) => d.healthStatus === 'offline').length;

    // Generate suggested actions
    const suggestedActions: string[] = [];
    if (offlineCount > 0) {
      suggestedActions.push(`Review ${offlineCount} offline device(s) - check network connectivity and power`);
    }
    if (degradedCount > 0) {
      suggestedActions.push(`Investigate ${degradedCount} degraded device(s) - may have intermittent connectivity issues`);
    }
    if (healthyCount === devices.length && devices.length > 0) {
      suggestedActions.push('All devices are healthy and online');
    }

    return {
      ok: true,
      summary: `Health check complete: ${healthyCount} healthy, ${degradedCount} degraded, ${offlineCount} offline`,
      scope,
      totalDevices: devices.length,
      healthy: healthyCount,
      degraded: degradedCount,
      offline: offlineCount,
      devices: deviceHealth,
      suggestedActions,
    };
  } catch (error) {
    console.error('[DeviceHandlers] Error in handleDeviceHealthCheck:', error);
    return {
      ok: false,
      summary: `Failed to check device health: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Handle playlist assignment audit
 * 
 * Analyzes playlist assignment frequency for devices
 */
export async function handlePlaylistAssignmentAudit(
  payload: PlaylistAssignmentAuditPayload,
  context: OrchestratorContext
) {
  try {
    const { tenantId, storeId, deviceId, windowHours = 24 } = payload;

    // Calculate window start time
    const windowStart = new Date();
    windowStart.setHours(windowStart.getHours() - windowHours);

    // Build where clause for activity events
    const where: any = {
      tenantId,
      type: ActivityEventType.PLAYLIST_ASSIGNED,
      occurredAt: { gte: windowStart },
    };

    if (deviceId) {
      where.deviceId = deviceId;
    } else if (storeId) {
      where.storeId = storeId;
    }

    // Query playlist assignment events
    const assignments = await prisma.activityEvent.findMany({
      where,
      select: {
        id: true,
        deviceId: true,
        occurredAt: true,
        payload: true,
      },
      orderBy: { occurredAt: 'desc' },
    });

    // Group assignments by device
    const deviceAssignments = new Map<string, {
      deviceId: string;
      count: number;
      lastAssignment: Date | null;
      assignments: Array<{ occurredAt: Date; playlistId?: string }>;
    }>();

    for (const assignment of assignments) {
      if (!assignment.deviceId) continue;

      const playlistId = (assignment.payload as any)?.playlistId;
      
      if (!deviceAssignments.has(assignment.deviceId)) {
        deviceAssignments.set(assignment.deviceId, {
          deviceId: assignment.deviceId,
          count: 0,
          lastAssignment: null,
          assignments: [],
        });
      }

      const deviceData = deviceAssignments.get(assignment.deviceId)!;
      deviceData.count++;
      deviceData.assignments.push({
        occurredAt: assignment.occurredAt,
        playlistId,
      });

      if (!deviceData.lastAssignment || assignment.occurredAt > deviceData.lastAssignment) {
        deviceData.lastAssignment = assignment.occurredAt;
      }
    }

    // Fetch device names
    const deviceIds = Array.from(deviceAssignments.keys());
    const devices = await prisma.device.findMany({
      where: {
        id: { in: deviceIds },
        tenantId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    const deviceMap = new Map(devices.map((d) => [d.id, d.name || d.id]));

    // Calculate assignments per hour and flag high-frequency devices
    const thresholdPerHour = 3; // Flag if more than 3 assignments per hour
    const auditResults = Array.from(deviceAssignments.values()).map((data) => {
      const assignmentsPerHour = (data.count / windowHours);
      const isHighFrequency = assignmentsPerHour > thresholdPerHour;

      return {
        deviceId: data.deviceId,
        deviceName: deviceMap.get(data.deviceId) || data.deviceId,
        assignmentCount: data.count,
        assignmentsPerHour: Math.round(assignmentsPerHour * 10) / 10,
        lastAssignment: data.lastAssignment,
        isHighFrequency,
        warning: isHighFrequency ? `High assignment frequency: ${Math.round(assignmentsPerHour * 10) / 10} per hour` : null,
      };
    });

    const highFrequencyDevices = auditResults.filter((r) => r.isHighFrequency);

    // Generate suggested actions
    const suggestedActions: string[] = [];
    if (highFrequencyDevices.length > 0) {
      suggestedActions.push(`Stabilize ${highFrequencyDevices.length} device(s) with high playlist assignment frequency`);
      suggestedActions.push('Consider using scheduled playlists instead of frequent manual assignments');
    } else if (auditResults.length > 0) {
      suggestedActions.push('Playlist assignment frequency is within normal range');
    } else {
      suggestedActions.push('No playlist assignments found in the specified time window');
    }

    return {
      ok: true,
      summary: `Audited ${auditResults.length} device(s): ${highFrequencyDevices.length} with high assignment frequency`,
      windowHours,
      totalAssignments: assignments.length,
      devices: auditResults,
      highFrequencyDevices: highFrequencyDevices.length,
      suggestedActions,
    };
  } catch (error) {
    console.error('[DeviceHandlers] Error in handlePlaylistAssignmentAudit:', error);
    return {
      ok: false,
      summary: `Failed to audit playlist assignments: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Handle device maintenance plan
 * 
 * Creates or adjusts maintenance schedule for devices
 */
export async function handleDeviceMaintenancePlan(
  payload: DeviceMaintenancePlanPayload,
  context: OrchestratorContext
) {
  try {
    const { tenantId, deviceId, frequencyDays = 7, createCalendarEvents = false } = payload;

    // Verify device exists
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        name: true,
        tenantId: true,
      },
    });

    if (!device) {
      return {
        ok: false,
        summary: `Device not found: ${deviceId}`,
      };
    }

    if (device.tenantId !== tenantId) {
      return {
        ok: false,
        summary: 'Device does not belong to the specified tenant',
      };
    }

    // Calculate next maintenance date
    const nextMaintenance = new Date();
    nextMaintenance.setDate(nextMaintenance.getDate() + frequencyDays);
    nextMaintenance.setHours(9, 0, 0, 0); // Default to 9 AM

    // Store maintenance plan in DeviceAlert table as a maintenance reminder
    // Check if maintenance alert already exists
    const existingAlert = await prisma.deviceAlert.findFirst({
      where: {
        deviceId,
        type: 'maintenance_scheduled',
        resolved: false,
      },
    });

    let maintenanceAlert;
    if (existingAlert) {
      // Update existing alert
      maintenanceAlert = await prisma.deviceAlert.update({
        where: { id: existingAlert.id },
        data: {
          message: `Next maintenance scheduled for ${nextMaintenance.toLocaleDateString()}`,
          status: 'pending',
          resolved: false,
          resolvedAt: null,
        },
      });
    } else {
      // Create new alert
      maintenanceAlert = await prisma.deviceAlert.create({
        data: {
          deviceId,
          type: 'maintenance_scheduled',
          message: `Next maintenance scheduled for ${nextMaintenance.toLocaleDateString()}`,
          status: 'pending',
          resolved: false,
        },
      });
    }

    return {
      ok: true,
      summary: `Maintenance plan created for ${device.name || deviceId}`,
      deviceId,
      deviceName: device.name || deviceId,
      frequencyDays,
      nextMaintenance: nextMaintenance.toISOString(),
      nextMaintenanceDate: nextMaintenance.toLocaleDateString(),
      createCalendarEvents,
      maintenanceAlertId: maintenanceAlert.id,
      message: `Next maintenance scheduled for ${nextMaintenance.toLocaleDateString()}`,
    };
  } catch (error) {
    console.error('[DeviceHandlers] Error in handleDeviceMaintenancePlan:', error);
    return {
      ok: false,
      summary: `Failed to create maintenance plan: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Handle device alert setup for heartbeats
 * 
 * Configures alert rules for heartbeat failures
 */
export async function handleDeviceAlertSetupHeartbeats(
  payload: DeviceAlertSetupHeartbeatsPayload,
  context: OrchestratorContext
) {
  try {
    const { tenantId, deviceIds, offlineThresholdMinutes = 10, channels = ['dashboard'] } = payload;

    // If deviceIds not provided, get all tenant devices
    let targetDevices: Array<{ id: string; name: string | null }> = [];
    
    if (deviceIds && deviceIds.length > 0) {
      targetDevices = await prisma.device.findMany({
        where: {
          id: { in: deviceIds },
          tenantId,
        },
        select: {
          id: true,
          name: true,
        },
      });
    } else {
      targetDevices = await prisma.device.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
        },
      });
    }

    // Create alert rules (stored as DeviceAlert records with special type)
    const alertRules = [];
    for (const device of targetDevices) {
      // Check if alert rule already exists
      const existingAlert = await prisma.deviceAlert.findFirst({
        where: {
          deviceId: device.id,
          type: 'heartbeat_threshold',
          resolved: false,
        },
      });

      if (existingAlert) {
        // Update existing alert
        await prisma.deviceAlert.update({
          where: { id: existingAlert.id },
          data: {
            message: `Alert: Device offline for ${offlineThresholdMinutes} minutes`,
            reason: `threshold_${offlineThresholdMinutes}`,
          },
        });
        alertRules.push({
          deviceId: device.id,
          deviceName: device.name || device.id,
          alertId: existingAlert.id,
          threshold: offlineThresholdMinutes,
          status: 'updated',
        });
      } else {
        // Create new alert rule (as a pending alert that will be triggered when threshold is met)
        const alert = await prisma.deviceAlert.create({
          data: {
            deviceId: device.id,
            type: 'heartbeat_threshold',
            message: `Alert: Device offline for ${offlineThresholdMinutes} minutes`,
            reason: `threshold_${offlineThresholdMinutes}`,
            status: 'pending',
            resolved: false,
          },
        });
        alertRules.push({
          deviceId: device.id,
          deviceName: device.name || device.id,
          alertId: alert.id,
          threshold: offlineThresholdMinutes,
          status: 'created',
        });
      }
    }

    return {
      ok: true,
      summary: `Alert rules configured for ${alertRules.length} device(s)`,
      offlineThresholdMinutes,
      channels,
      alertRules,
      message: `Alerts will trigger when devices are offline for ${offlineThresholdMinutes} minutes`,
    };
  } catch (error) {
    console.error('[DeviceHandlers] Error in handleDeviceAlertSetupHeartbeats:', error);
    return {
      ok: false,
      summary: `Failed to setup alerts: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Handle device monitoring review
 * 
 * Generates monitoring checklist/review text
 */
export async function handleDeviceMonitoringReview(
  payload: DeviceMonitoringReviewPayload,
  context: OrchestratorContext
) {
  try {
    const { tenantId, includeChecklists = true } = payload;

    // Fetch all devices for tenant
    const devices = await prisma.device.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        location: true,
      },
    });

    // Calculate health metrics
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const offlineDevices = devices.filter((d) => {
      if (!d.lastSeenAt) return true;
      const minutesSinceLastSeen = (now.getTime() - new Date(d.lastSeenAt).getTime()) / (1000 * 60);
      return minutesSinceLastSeen > OFFLINE_THRESHOLD_MINUTES;
    });

    const degradedDevices = devices.filter((d) => {
      if (!d.lastSeenAt) return false;
      const minutesSinceLastSeen = (now.getTime() - new Date(d.lastSeenAt).getTime()) / (1000 * 60);
      return minutesSinceLastSeen > DEGRADED_THRESHOLD_MINUTES && minutesSinceLastSeen <= OFFLINE_THRESHOLD_MINUTES;
    });

    // Query heartbeat failures in last 24 hours (device status changes to offline)
    const heartbeatFailures = await prisma.activityEvent.count({
      where: {
        tenantId,
        type: ActivityEventType.DEVICE_STATUS_CHANGE,
        occurredAt: { gte: last24Hours },
      },
    });

    // Query active alerts
    const activeAlerts = await prisma.deviceAlert.count({
      where: {
        device: {
          tenantId,
        },
        resolved: false,
      },
    });

    // Generate checklist
    const checklist = includeChecklists
      ? [
          `Verify all ${devices.length} device(s) are online`,
          `Check heartbeat frequency (${devices.length - offlineDevices.length} devices reporting)`,
          `Review alert thresholds (${activeAlerts} active alerts)`,
          `Confirm playlist assignments are stable`,
          `Monitor ${offlineDevices.length} offline device(s)`,
          `Investigate ${degradedDevices.length} degraded device(s)`,
        ]
      : [];

    return {
      ok: true,
      summary: `Device monitoring review for ${devices.length} device(s)`,
      totalDevices: devices.length,
      onlineDevices: devices.length - offlineDevices.length - degradedDevices.length,
      degradedDevices: degradedDevices.length,
      offlineDevices: offlineDevices.length,
      heartbeatFailuresLast24h: heartbeatFailures,
      activeAlerts,
      checklist,
      message: 'Review operational protocol and monitoring setup',
    };
  } catch (error) {
    console.error('[DeviceHandlers] Error in handleDeviceMonitoringReview:', error);
    return {
      ok: false,
      summary: `Failed to generate monitoring review: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
