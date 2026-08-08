/**
 * Resource Workspace persistence (Phase 3).
 * In-memory + optional SQLite via ensure-uri-workspace-tables.mjs
 */

import { randomBytes } from 'node:crypto';
import { WORKSPACE_STATUS } from './types.js';

const mem = new Map();

function id() {
  return `uriws_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}

function j(v) {
  return JSON.stringify(v ?? null);
}

function p(raw, fallback = null) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function resetWorkspaceStoreForTests() {
  mem.clear();
}

function emptyState() {
  return {
    shortlist: [],
    removed: [],
    groups: {},
    comparisons: [],
    selectedDestination: null,
    incompleteReusePlan: null,
    rightsSnapshots: {},
    combination: null,
    collectionName: null,
  };
}

export async function createWorkspace(prisma, row = {}) {
  const record = {
    id: row.id || id(),
    userId: row.userId || null,
    searchSessionId: row.searchSessionId || null,
    status: WORKSPACE_STATUS.ACTIVE,
    intentJson: row.intent || null,
    searchPlanJson: row.searchPlan || null,
    stateJson: { ...emptyState(), ...(row.state || {}) },
    evaluationJson: row.evaluation || { events: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (prisma?.$executeRawUnsafe) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ResourceWorkspace"
         ("id","userId","searchSessionId","status","intentJson","searchPlanJson","stateJson","evaluationJson","createdAt","updatedAt")
         VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        record.id,
        record.userId,
        record.searchSessionId,
        record.status,
        j(record.intentJson),
        j(record.searchPlanJson),
        j(record.stateJson),
        j(record.evaluationJson),
      );
      mem.set(record.id, record);
      return record;
    } catch {
      /* mem */
    }
  }
  mem.set(record.id, record);
  return record;
}

export async function getWorkspace(prisma, workspaceId) {
  if (prisma?.$queryRawUnsafe) {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "ResourceWorkspace" WHERE "id" = ? LIMIT 1`,
        workspaceId,
      );
      const r = rows?.[0];
      if (r) {
        const mapped = {
          ...r,
          intentJson: p(r.intentJson, null),
          searchPlanJson: p(r.searchPlanJson, null),
          stateJson: p(r.stateJson, emptyState()),
          evaluationJson: p(r.evaluationJson, { events: [] }),
        };
        mem.set(workspaceId, mapped);
        return mapped;
      }
    } catch {
      /* mem */
    }
  }
  return mem.get(workspaceId) || null;
}

export async function updateWorkspace(prisma, workspaceId, patch) {
  const current = await getWorkspace(prisma, workspaceId);
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    stateJson: patch.stateJson ? { ...current.stateJson, ...patch.stateJson } : current.stateJson,
    evaluationJson: patch.evaluationJson || current.evaluationJson,
    updatedAt: new Date().toISOString(),
  };
  if (prisma?.$executeRawUnsafe) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "ResourceWorkspace" SET
          "status" = ?,
          "intentJson" = ?,
          "searchPlanJson" = ?,
          "stateJson" = ?,
          "evaluationJson" = ?,
          "searchSessionId" = ?,
          "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = ?`,
        next.status,
        j(next.intentJson),
        j(next.searchPlanJson),
        j(next.stateJson),
        j(next.evaluationJson),
        next.searchSessionId || null,
        workspaceId,
      );
    } catch {
      /* mem */
    }
  }
  mem.set(workspaceId, next);
  return next;
}

export async function listWorkspaces(prisma, { userId, limit = 20 } = {}) {
  if (prisma?.$queryRawUnsafe && userId) {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "ResourceWorkspace" WHERE "userId" = ? ORDER BY "updatedAt" DESC LIMIT ?`,
        userId,
        Number(limit) || 20,
      );
      return (rows || []).map((r) => ({
        ...r,
        intentJson: p(r.intentJson, null),
        stateJson: p(r.stateJson, emptyState()),
        evaluationJson: p(r.evaluationJson, { events: [] }),
      }));
    } catch {
      /* mem */
    }
  }
  return [...mem.values()]
    .filter((w) => !userId || w.userId === userId)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, limit);
}
