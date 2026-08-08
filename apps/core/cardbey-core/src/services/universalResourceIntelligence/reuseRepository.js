/**
 * URI Phase 2 persistence — raw SQL (tables via ensure-uri-reuse-tables.mjs).
 * Falls back to in-memory maps when DB unavailable (tests / cold start).
 */

import { randomBytes } from 'node:crypto';

const mem = {
  sessions: new Map(),
  candidates: new Map(),
  selections: new Map(),
  intents: new Map(),
  decisions: new Map(),
  attributions: new Map(),
  retrievals: new Map(),
  uses: new Map(),
};

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
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

async function dbOk(prisma) {
  return Boolean(prisma?.$executeRawUnsafe && prisma?.$queryRawUnsafe);
}

export function resetReuseRepositoryForTests() {
  for (const m of Object.values(mem)) m.clear();
}

export async function createSearchSession(prisma, row) {
  const record = {
    id: row.id || id('urises'),
    userId: row.userId || null,
    utterance: row.utterance || null,
    intentJson: row.intent || {},
    searchPlanJson: row.searchPlan || null,
    status: row.status || 'COMPLETED',
    jobId: row.jobId || null,
    consumer: row.consumer || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (await dbOk(prisma)) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ResourceSearchSession"
         ("id","userId","utterance","intentJson","searchPlanJson","status","jobId","consumer","createdAt","updatedAt")
         VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        record.id,
        record.userId,
        record.utterance,
        j(record.intentJson),
        j(record.searchPlanJson),
        record.status,
        record.jobId,
        record.consumer,
      );
      return record;
    } catch {
      /* fall through to memory */
    }
  }
  mem.sessions.set(record.id, record);
  return record;
}

export async function insertCandidateSnapshots(prisma, sessionId, candidates) {
  const out = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const resource = c.resource || c;
    const snap = {
      id: id('urics'),
      sessionId,
      resourceId: resource.id,
      rank: i,
      fingerprint: resource.fingerprint || null,
      payloadJson: resource,
      explanationJson: c.explanation || null,
      rightsJson: c.rights || null,
      createdAt: new Date().toISOString(),
    };
    if (await dbOk(prisma)) {
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "ResourceCandidateSnapshot"
           ("id","sessionId","resourceId","rank","fingerprint","payloadJson","explanationJson","rightsJson","createdAt")
           VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
          snap.id,
          sessionId,
          snap.resourceId,
          snap.rank,
          snap.fingerprint,
          j(snap.payloadJson),
          j(snap.explanationJson),
          j(snap.rightsJson),
        );
        out.push(snap);
        continue;
      } catch {
        /* mem */
      }
    }
    mem.candidates.set(snap.id, snap);
    out.push(snap);
  }
  return out;
}

export async function getSession(prisma, sessionId) {
  if (await dbOk(prisma)) {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "ResourceSearchSession" WHERE "id" = ? LIMIT 1`,
        sessionId,
      );
      const row = rows?.[0];
      if (row) {
        return {
          ...row,
          intentJson: p(row.intentJson, {}),
          searchPlanJson: p(row.searchPlanJson, null),
        };
      }
    } catch {
      /* mem */
    }
  }
  return mem.sessions.get(sessionId) || null;
}

export async function listCandidateSnapshots(prisma, sessionId) {
  if (await dbOk(prisma)) {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "ResourceCandidateSnapshot" WHERE "sessionId" = ? ORDER BY "rank" ASC`,
        sessionId,
      );
      return (rows || []).map((r) => ({
        ...r,
        payloadJson: p(r.payloadJson, {}),
        explanationJson: p(r.explanationJson, null),
        rightsJson: p(r.rightsJson, null),
      }));
    } catch {
      /* mem */
    }
  }
  return [...mem.candidates.values()]
    .filter((c) => c.sessionId === sessionId)
    .sort((a, b) => a.rank - b.rank);
}

export async function getCandidateSnapshot(prisma, snapshotId) {
  const list = [...mem.candidates.values()];
  const memHit = list.find((c) => c.id === snapshotId);
  if (await dbOk(prisma)) {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "ResourceCandidateSnapshot" WHERE "id" = ? LIMIT 1`,
        snapshotId,
      );
      const r = rows?.[0];
      if (r) {
        return {
          ...r,
          payloadJson: p(r.payloadJson, {}),
          explanationJson: p(r.explanationJson, null),
          rightsJson: p(r.rightsJson, null),
        };
      }
    } catch {
      /* mem */
    }
  }
  return memHit || null;
}

export async function createSelection(prisma, row) {
  const record = {
    id: row.id || id('urisel'),
    sessionId: row.sessionId,
    candidateSnapshotId: row.candidateSnapshotId,
    resourceId: row.resourceId,
    userId: row.userId || null,
    status: 'SELECTED',
    createdAt: new Date().toISOString(),
  };
  if (await dbOk(prisma)) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ResourceSelection"
         ("id","sessionId","candidateSnapshotId","resourceId","userId","status","createdAt")
         VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
        record.id,
        record.sessionId,
        record.candidateSnapshotId,
        record.resourceId,
        record.userId,
        record.status,
      );
      return record;
    } catch {
      /* mem */
    }
  }
  mem.selections.set(record.id, record);
  return record;
}

export async function createReuseIntent(prisma, row) {
  const record = {
    id: row.id || id('uriint'),
    selectionId: row.selectionId,
    sessionId: row.sessionId,
    resourceId: row.resourceId,
    intendedPurpose: row.intendedPurpose || null,
    targetType: row.targetType || null,
    targetId: row.targetId || null,
    preferredCustodyMode: row.preferredCustodyMode || null,
    payloadJson: row.payload || null,
    status: 'DRAFT',
    createdAt: new Date().toISOString(),
  };
  if (await dbOk(prisma)) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ReuseIntent"
         ("id","selectionId","sessionId","resourceId","intendedPurpose","targetType","targetId","preferredCustodyMode","payloadJson","status","createdAt")
         VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
        record.id,
        record.selectionId,
        record.sessionId,
        record.resourceId,
        record.intendedPurpose,
        record.targetType,
        record.targetId,
        record.preferredCustodyMode,
        j(record.payloadJson),
        record.status,
      );
      return record;
    } catch {
      /* mem */
    }
  }
  mem.intents.set(record.id, record);
  return record;
}

export async function getReuseIntent(prisma, intentId) {
  if (await dbOk(prisma)) {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "ReuseIntent" WHERE "id" = ? LIMIT 1`,
        intentId,
      );
      const r = rows?.[0];
      if (r) {
        return {
          ...r,
          payloadJson: p(r.payloadJson, null),
        };
      }
    } catch {
      /* mem */
    }
  }
  return mem.intents.get(intentId) || null;
}

export async function createReuseDecision(prisma, row) {
  const record = {
    id: row.id || id('uridec'),
    reuseIntentId: row.reuseIntentId,
    reusePlanJson: row.reusePlan || {},
    custodyMode: row.custodyMode,
    rightsDecisionJson: row.rightsDecision || {},
    policyVersion: row.policyVersion,
    userConfirmed: false,
    status: 'AWAITING_CONFIRMATION',
    confirmedAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (await dbOk(prisma)) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ReuseDecision"
         ("id","reuseIntentId","reusePlanJson","custodyMode","rightsDecisionJson","policyVersion","userConfirmed","status","createdAt","updatedAt")
         VALUES (?,?,?,?,?,?,0,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        record.id,
        record.reuseIntentId,
        j(record.reusePlanJson),
        record.custodyMode,
        j(record.rightsDecisionJson),
        record.policyVersion,
        record.status,
      );
      return record;
    } catch {
      /* mem */
    }
  }
  mem.decisions.set(record.id, record);
  return record;
}

export async function getReuseDecision(prisma, decisionId) {
  if (await dbOk(prisma)) {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "ReuseDecision" WHERE "id" = ? LIMIT 1`,
        decisionId,
      );
      const r = rows?.[0];
      if (r) {
        return {
          ...r,
          reusePlanJson: p(r.reusePlanJson, {}),
          rightsDecisionJson: p(r.rightsDecisionJson, {}),
          userConfirmed: Boolean(r.userConfirmed),
        };
      }
    } catch {
      /* mem */
    }
  }
  return mem.decisions.get(decisionId) || null;
}

export async function updateReuseDecision(prisma, decisionId, patch) {
  const current = await getReuseDecision(prisma, decisionId);
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (await dbOk(prisma)) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "ReuseDecision" SET
          "userConfirmed" = ?,
          "status" = ?,
          "confirmedAt" = ?,
          "cancelledAt" = ?,
          "rightsDecisionJson" = ?,
          "reusePlanJson" = ?,
          "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = ?`,
        next.userConfirmed ? 1 : 0,
        next.status,
        next.confirmedAt || null,
        next.cancelledAt || null,
        j(next.rightsDecisionJson || next.rightsDecisionJson),
        j(next.reusePlanJson || next.reusePlanJson),
        decisionId,
      );
      mem.decisions.set(decisionId, next);
      return next;
    } catch {
      /* mem */
    }
  }
  mem.decisions.set(decisionId, next);
  return next;
}

export async function createAttributionSnapshot(prisma, row) {
  const record = {
    id: row.id || id('uriattr'),
    externalResourceUseId: row.externalResourceUseId || null,
    reuseDecisionId: row.reuseDecisionId || null,
    text: row.text || '',
    creator: row.creator || null,
    provider: row.provider || null,
    license: row.license || null,
    sourceUrl: row.sourceUrl || null,
    payloadJson: row.payload || null,
    createdAt: new Date().toISOString(),
  };
  if (await dbOk(prisma)) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ResourceAttributionSnapshot"
         ("id","externalResourceUseId","reuseDecisionId","text","creator","provider","license","sourceUrl","payloadJson","createdAt")
         VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
        record.id,
        record.externalResourceUseId,
        record.reuseDecisionId,
        record.text,
        record.creator,
        record.provider,
        record.license,
        record.sourceUrl,
        j(record.payloadJson),
      );
      return record;
    } catch {
      /* mem */
    }
  }
  mem.attributions.set(record.id, record);
  return record;
}

export async function createRetrievalJob(prisma, row) {
  const record = {
    id: row.id || id('uriret'),
    reuseDecisionId: row.reuseDecisionId,
    custodyMode: row.custodyMode,
    status: row.status || 'QUEUED',
    attempt: row.attempt || 0,
    maxAttempts: row.maxAttempts || 3,
    errorCode: row.errorCode || null,
    resultJson: row.result || null,
    binaryStored: Boolean(row.binaryStored),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (await dbOk(prisma)) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ResourceRetrievalJob"
         ("id","reuseDecisionId","custodyMode","status","attempt","maxAttempts","errorCode","resultJson","binaryStored","createdAt","updatedAt")
         VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        record.id,
        record.reuseDecisionId,
        record.custodyMode,
        record.status,
        record.attempt,
        record.maxAttempts,
        record.errorCode,
        j(record.resultJson),
        record.binaryStored ? 1 : 0,
      );
      return record;
    } catch {
      /* mem */
    }
  }
  mem.retrievals.set(record.id, record);
  return record;
}

export async function updateRetrievalJob(prisma, jobId, patch) {
  const current = mem.retrievals.get(jobId) || { id: jobId };
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  if (await dbOk(prisma)) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "ResourceRetrievalJob" SET
          "status" = ?, "attempt" = ?, "errorCode" = ?, "resultJson" = ?, "binaryStored" = ?, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = ?`,
        next.status,
        next.attempt ?? 0,
        next.errorCode || null,
        j(next.resultJson ?? next.result),
        next.binaryStored ? 1 : 0,
        jobId,
      );
    } catch {
      /* mem */
    }
  }
  mem.retrievals.set(jobId, next);
  return next;
}

export async function createExternalResourceUse(prisma, row) {
  const record = {
    id: row.id || id('urieu'),
    userId: row.userId || null,
    sessionId: row.sessionId || null,
    selectionId: row.selectionId || null,
    reuseIntentId: row.reuseIntentId || null,
    reuseDecisionId: row.reuseDecisionId || null,
    resourceId: row.resourceId,
    intendedPurpose: row.intendedPurpose || null,
    sourceMetadataJson: row.sourceMetadata || {},
    rightsDecisionJson: row.rightsDecision || {},
    policyVersion: row.policyVersion,
    attributionSnapshotId: row.attributionSnapshotId || null,
    custodyMode: row.custodyMode,
    targetType: row.targetType || null,
    targetId: row.targetId || null,
    playlistId: row.playlistId || null,
    suitcaseItemId: row.suitcaseItemId || null,
    signageAssetId: row.signageAssetId || null,
    retrievalJobId: row.retrievalJobId || null,
    retrievalResultJson: row.retrievalResult || null,
    binaryStored: Boolean(row.binaryStored),
    status: row.status || 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (await dbOk(prisma)) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ExternalResourceUse"
         ("id","userId","sessionId","selectionId","reuseIntentId","reuseDecisionId","resourceId","intendedPurpose",
          "sourceMetadataJson","rightsDecisionJson","policyVersion","attributionSnapshotId","custodyMode",
          "targetType","targetId","playlistId","suitcaseItemId","signageAssetId","retrievalJobId","retrievalResultJson",
          "binaryStored","status","createdAt","updatedAt")
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        record.id,
        record.userId,
        record.sessionId,
        record.selectionId,
        record.reuseIntentId,
        record.reuseDecisionId,
        record.resourceId,
        record.intendedPurpose,
        j(record.sourceMetadataJson),
        j(record.rightsDecisionJson),
        record.policyVersion,
        record.attributionSnapshotId,
        record.custodyMode,
        record.targetType,
        record.targetId,
        record.playlistId,
        record.suitcaseItemId,
        record.signageAssetId,
        record.retrievalJobId,
        j(record.retrievalResultJson),
        record.binaryStored ? 1 : 0,
        record.status,
      );
      return record;
    } catch {
      /* mem */
    }
  }
  mem.uses.set(record.id, record);
  return record;
}

export async function getExternalResourceUse(prisma, useId) {
  if (await dbOk(prisma)) {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "ExternalResourceUse" WHERE "id" = ? LIMIT 1`,
        useId,
      );
      const r = rows?.[0];
      if (r) {
        return {
          ...r,
          sourceMetadataJson: p(r.sourceMetadataJson, {}),
          rightsDecisionJson: p(r.rightsDecisionJson, {}),
          retrievalResultJson: p(r.retrievalResultJson, null),
          binaryStored: Boolean(r.binaryStored),
        };
      }
    } catch {
      /* mem */
    }
  }
  return mem.uses.get(useId) || null;
}
