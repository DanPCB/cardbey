/**
 * Reads past mission EFL feedback from RagChunk (scope: efl_feedback) for hypothesis / planning.
 * RagChunk has no Prisma `metadata` column — vector fields may live in an optional __EFL_META__ JSON suffix on `content`
 * (see ragFeedbackWriter) or are inferred from sourcePath / body text.
 */

import { getPrismaClient } from '../lib/prisma.js';

const EFL_SCOPE = 'efl_feedback';
const META_MARKER = '__EFL_META__';

function inferTypeFromSourcePath(sourcePath) {
  const parts = String(sourcePath ?? '').split('/').filter(Boolean);
  if (parts[0] === 'efl_feedback' && parts.length >= 3) return parts[2];
  return 'unknown';
}

function splitContentBodyAndMeta(content) {
  const raw = String(content ?? '');
  const idx = raw.lastIndexOf(META_MARKER);
  if (idx === -1) {
    return { body: raw.trim(), meta: null };
  }
  const body = raw.slice(0, idx).trim();
  const jsonStr = raw.slice(idx + META_MARKER.length).trim();
  try {
    const meta = JSON.parse(jsonStr);
    return { body, meta: meta && typeof meta === 'object' ? meta : null };
  } catch {
    return { body, meta: null };
  }
}

function splitQueryAndObservation(body) {
  const sep = '\n\n';
  const i = body.indexOf(sep);
  if (i === -1) {
    return { query: body, observation: body };
  }
  return {
    query: body.slice(0, i).trim(),
    observation: body.slice(i + sep.length).trim(),
  };
}

/**
 * @param {string} query
 * @param {{ storeType?: string, intent?: string, limit?: number, minWeight?: number }} [options]
 * @returns {Promise<Array<{ type: string, query: string, observation: string, context: object, weight: number, createdAt: Date }>>}
 */
export async function readEflFeedback(query, options = {}) {
  try {
    const prisma = getPrismaClient();
    const limit = Number.isFinite(options.limit) ? Math.max(1, options.limit) : 10;
    const minWeight = Number.isFinite(options.minWeight) ? options.minWeight : 0.3;
    const storeType = options.storeType?.trim();
    const intent = options.intent?.trim();
    const q = typeof query === 'string' ? query.trim() : '';

    const take = Math.min(500, Math.max(limit * 25, limit));

    const records = await prisma.ragChunk.findMany({
      where: { scope: EFL_SCOPE },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        content: true,
        sourcePath: true,
        createdAt: true,
      },
    });

    const out = [];

    for (const record of records) {
      const { body, meta } = splitContentBodyAndMeta(record.content);
      const { query: bodyQuery, observation } = splitQueryAndObservation(body);

      const parsedType = meta?.type ?? inferTypeFromSourcePath(record.sourcePath);
      const parsedQuery = meta?.query ?? bodyQuery;
      const weight =
        typeof meta?.weight === 'number' && !Number.isNaN(meta.weight)
          ? meta.weight
          : 0.5;
      const context =
        meta?.context && typeof meta.context === 'object' && !Array.isArray(meta.context)
          ? meta.context
          : {};

      if (weight < minWeight) continue;

      const haystack = `${record.content}\n${record.sourcePath}`.toLowerCase();
      if (storeType && !haystack.includes(storeType.toLowerCase())) continue;
      if (intent && !haystack.includes(intent.toLowerCase())) continue;
      if (q && !haystack.includes(q.toLowerCase())) continue;

      out.push({
        type: parsedType,
        query: parsedQuery,
        observation,
        context,
        weight,
        createdAt: record.createdAt,
      });

      if (out.length >= limit) break;
    }

    return out;
  } catch (err) {
    console.error('[eflRagReader] error:', err?.message);
    return [];
  }
}
