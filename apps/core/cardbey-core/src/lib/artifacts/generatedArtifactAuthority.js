/**
 * Generated Artifact Authority V1 — durable records for generated outputs.
 * Builds on artifactContract.js; persists to Mission.context.generatedArtifacts.
 */

import { randomUUID } from 'crypto';
import { getPrismaClient } from '../prisma.js';
import { mergeMissionContext } from '../mission.js';
import { normalizeArtifact, createArtifact } from './artifactContract.js';
import { emitMissionArtifact } from './artifactSse.js';

export const GENERATED_ARTIFACT_TYPES = new Set([
  'generated_video',
  'generated_slideshow',
  'generated_graphic',
  'generated_subtitle',
  'generated_music_selection',
  'generated_scene_clip',
  'generated_video_variant',
  'final_creative_asset',
  'campaign_package',
]);

export const GENERATED_ARTIFACT_CONTEXT_KEY = 'generatedArtifacts';

/** Map V1 artifactType → artifactContract type */
const TYPE_TO_CONTRACT = {
  generated_video: 'video',
  generated_slideshow: 'slideshow',
  generated_graphic: 'image',
  generated_subtitle: 'text_asset',
  generated_music_selection: 'text_asset',
  generated_scene_clip: 'video',
  generated_video_variant: 'video',
  final_creative_asset: 'video',
  campaign_package: 'campaign',
};

/**
 * @typedef {Object} GeneratedArtifactV1
 * @property {string} artifactId
 * @property {string} missionId
 * @property {string} ownerUserId
 * @property {string} source
 * @property {'generated_video'|'generated_slideshow'|'generated_graphic'|'campaign_package'} artifactType
 * @property {string} status
 * @property {string|null} [url]
 * @property {Record<string, unknown>|null} [payload]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @param {unknown} raw
 * @returns {GeneratedArtifactV1|null}
 */
export function normalizeGeneratedArtifactV1(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const artifactType = String(o.artifactType ?? o.type ?? '').trim().toLowerCase();
  if (!GENERATED_ARTIFACT_TYPES.has(artifactType)) return null;

  const artifactId =
    (typeof o.artifactId === 'string' && o.artifactId.trim()) ||
    (typeof o.id === 'string' && o.id.trim()) ||
    `gart-${randomUUID()}`;
  const missionId = typeof o.missionId === 'string' ? o.missionId.trim() : '';
  const ownerUserId = typeof o.ownerUserId === 'string' ? o.ownerUserId.trim() : '';
  if (!missionId || !ownerUserId) return null;

  const now = new Date().toISOString();
  const status = String(o.status ?? 'processing').trim().toLowerCase();
  const url =
    (typeof o.url === 'string' && o.url.trim()) ||
    (typeof o.previewUrl === 'string' && o.previewUrl.trim()) ||
    null;
  const payload =
    o.payload && typeof o.payload === 'object' && !Array.isArray(o.payload)
      ? /** @type {Record<string, unknown>} */ (o.payload)
      : null;

  return {
    artifactId,
    missionId,
    ownerUserId,
    source: typeof o.source === 'string' && o.source.trim() ? o.source.trim() : 'unknown',
    artifactType: /** @type {GeneratedArtifactV1['artifactType']} */ (artifactType),
    status,
    url,
    payload,
    createdAt: typeof o.createdAt === 'string' && o.createdAt.trim() ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === 'string' && o.updatedAt.trim() ? o.updatedAt : now,
  };
}

/**
 * @param {Partial<GeneratedArtifactV1> & { artifactType: GeneratedArtifactV1['artifactType']; missionId: string; ownerUserId: string }} fields
 * @returns {GeneratedArtifactV1}
 */
export function createGeneratedArtifactV1(fields) {
  const normalized = normalizeGeneratedArtifactV1({
    ...fields,
    artifactId: fields.artifactId ?? `gart-${randomUUID()}`,
    status: fields.status ?? 'processing',
    createdAt: fields.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  if (!normalized) {
    throw new Error('[generatedArtifactAuthority] invalid generated artifact fields');
  }
  return normalized;
}

/**
 * @param {GeneratedArtifactV1} record
 * @returns {import('./artifactContract.js').OperationalArtifact}
 */
export function generatedArtifactToOperational(record) {
  const contractType = TYPE_TO_CONTRACT[record.artifactType] ?? 'unknown';
  return createArtifact({
    id: record.artifactId,
    missionId: record.missionId,
    type: contractType,
    subtype: record.artifactType,
    title: record.artifactType.replace(/_/g, ' '),
    status: ['ready', 'failed', 'processing', 'requested', 'unavailable', 'blocked'].includes(record.status)
      ? record.status
      : 'processing',
    url: record.url ?? undefined,
    previewUrl: record.url ?? undefined,
    sourceTool: record.source,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    metadata: {
      ownerUserId: record.ownerUserId,
      artifactType: record.artifactType,
      ...(record.payload ? { inlinePayload: record.payload } : {}),
    },
  });
}

/**
 * Persist generated artifact to mission context + emit SSE.
 *
 * @param {GeneratedArtifactV1} record
 * @param {{ prisma?: import('@prisma/client').PrismaClient; emitSse?: boolean }} [opts]
 */
export async function persistGeneratedArtifactV1(record, opts = {}) {
  const prisma = opts.prisma ?? getPrismaClient();
  const normalized = normalizeGeneratedArtifactV1(record);
  if (!normalized) {
    throw new Error('[generatedArtifactAuthority] cannot persist invalid record');
  }

  const mission = await prisma.mission.findUnique({
    where: { id: normalized.missionId },
    select: { context: true },
  });

  const prevCtx =
    mission?.context && typeof mission.context === 'object' && !Array.isArray(mission.context)
      ? mission.context
      : {};
  const prevBundle = prevCtx[GENERATED_ARTIFACT_CONTEXT_KEY];
  const prevList = Array.isArray(prevBundle?.records) ? prevBundle.records : [];
  const withoutDup = prevList.filter(
    (r) => String(r?.artifactId ?? r?.id ?? '') !== normalized.artifactId,
  );
  const nextRecords = [...withoutDup, normalized].slice(-64);

  await mergeMissionContext(
    normalized.missionId,
    {
      [GENERATED_ARTIFACT_CONTEXT_KEY]: {
        version: 1,
        updatedAt: new Date().toISOString(),
        records: nextRecords,
      },
    },
    { prisma },
  );

  if (opts.emitSse !== false) {
    emitMissionArtifact(normalized.missionId, generatedArtifactToOperational(normalized));
  }

  return normalized;
}

/**
 * @param {string} missionId
 * @param {{ prisma?: import('@prisma/client').PrismaClient }} [opts]
 * @returns {Promise<GeneratedArtifactV1[]>}
 */
export async function listGeneratedArtifactsForMission(missionId, opts = {}) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return [];
  const prisma = opts.prisma ?? getPrismaClient();
  const mission = await prisma.mission.findUnique({
    where: { id: mid },
    select: { context: true },
  });
  const ctx = mission?.context;
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return [];
  const bundle = ctx[GENERATED_ARTIFACT_CONTEXT_KEY];
  if (!bundle || typeof bundle !== 'object' || !Array.isArray(bundle.records)) return [];
  return bundle.records.map(normalizeGeneratedArtifactV1).filter(Boolean);
}

/**
 * Convenience: create + persist from tool output.
 *
 * @param {{
 *   artifactType: GeneratedArtifactV1['artifactType'];
 *   missionId: string;
 *   ownerUserId: string;
 *   source: string;
 *   status?: string;
 *   url?: string|null;
 *   payload?: Record<string, unknown>|null;
 * }} fields
 */
export async function registerGeneratedArtifactV1(fields) {
  const record = createGeneratedArtifactV1(fields);
  await persistGeneratedArtifactV1(record);
  return record;
}

const CONTRACT_TYPE_TO_V1 = {
  video: 'generated_video',
  slideshow: 'generated_slideshow',
  image: 'generated_graphic',
  campaign: 'campaign_package',
};

/**
 * Persist durable V1 record from an operational artifact emit (video/slideshow/campaign).
 *
 * @param {import('./artifactContract.js').OperationalArtifact} artifact
 * @param {{ ownerUserId: string; source?: string }} opts
 */
export async function registerGeneratedArtifactFromOperational(artifact, opts) {
  const ownerUserId = typeof opts?.ownerUserId === 'string' ? opts.ownerUserId.trim() : '';
  if (!artifact || !ownerUserId) return null;

  const missionId = typeof artifact.missionId === 'string' ? artifact.missionId.trim() : '';
  if (!missionId) return null;

  const subtype = String(artifact.subtype ?? artifact.metadata?.artifactType ?? '').trim().toLowerCase();
  const artifactType =
    (GENERATED_ARTIFACT_TYPES.has(subtype) && subtype) ||
    CONTRACT_TYPE_TO_V1[String(artifact.type ?? '').trim().toLowerCase()] ||
    null;
  if (!artifactType) return null;

  const url =
    (typeof artifact.url === 'string' && artifact.url.trim()) ||
    (typeof artifact.previewUrl === 'string' && artifact.previewUrl.trim()) ||
    null;

  return registerGeneratedArtifactV1({
    artifactId: artifact.id,
    artifactType,
    missionId,
    ownerUserId,
    source: opts.source ?? artifact.sourceTool ?? 'generated',
    status: artifact.status ?? 'processing',
    url,
    payload: artifact.metadata && typeof artifact.metadata === 'object' ? artifact.metadata : null,
  });
}
