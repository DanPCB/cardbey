/**
 * Compact plain-text blackboard digest for LLM prompts (e.g. intake classifier).
 * Not JSON — natural-language block for routing with mission memory.
 */

import { getPrismaClient } from '../prisma.js';

const MAX_CHARS = 1600; /** ~300–400 tokens depending on model tokenizer */

/** @param {unknown} raw */
function parsePayload(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return /** @type {Record<string, unknown>} */ (raw);
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p != null && typeof p === 'object' && !Array.isArray(p) ? p : { value: p };
    } catch {
      return { raw };
    }
  }
  return { value: raw };
}

/** @param {unknown} v */
function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Collect http(s) URLs from a shallow JSON walk (bounded).
 * @param {unknown} node
 * @param {Set<string>} out
 * @param {number} [budget]
 */
function collectUrls(node, out, budget = 12) {
  if (out.size >= budget) return;
  if (node == null) return;
  if (typeof node === 'string') {
    const s = node.trim();
    if (/^https?:\/\//i.test(s) && s.length < 500) out.add(s);
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) {
      collectUrls(x, out, budget);
      if (out.size >= budget) return;
    }
    return;
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node)) {
      collectUrls(v, out, budget);
      if (out.size >= budget) return;
    }
  }
}

/**
 * Last N blackboard rows (all event types) for missionId, newest first from DB, then reversed to chronological.
 * @param {string} missionId
 * @param {number} [take]
 */
async function loadRecentBlackboardRows(missionId, take = 20) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return [];
  const prisma = getPrismaClient();
  if (!prisma?.missionBlackboard || typeof prisma.missionBlackboard.findMany !== 'function') {
    return [];
  }
  const rows = await prisma.missionBlackboard.findMany({
    where: { missionId: mid },
    orderBy: { seq: 'desc' },
    take,
    select: { seq: true, eventType: true, payload: true },
  });
  return rows.reverse();
}

/**
 * @param {string | null | undefined} missionId
 * @returns {Promise<string>}
 */
export async function getBlackboardContextSummary(missionId) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return '';

  try {
    const prisma = getPrismaClient();
    const lines = [];
    lines.push(`Mission: ${mid}`);

    let storeId = '';
    let storeName = '';
    /** @type {Set<string>} */
    const toolsDone = new Set();
    /** @type {Set<string>} */
    const assetNotes = new Set();
    /** @type {Set<string>} */
    const urls = new Set();

    let pipelineStatus = '';
    let pipelineRunState = '';

    if (prisma?.missionPipeline?.findUnique) {
      const pipe = await prisma.missionPipeline
        .findUnique({
          where: { id: mid },
          select: { status: true, runState: true, outputsJson: true },
        })
        .catch(() => null);
      if (pipe) {
        pipelineStatus = str(pipe.status);
        pipelineRunState = str(pipe.runState);
        const outRaw = pipe.outputsJson;
        let out =
          outRaw && typeof outRaw === 'object' && !Array.isArray(outRaw)
            ? /** @type {Record<string, unknown>} */ (outRaw)
            : {};
        if (typeof outRaw === 'string') {
          try {
            const parsed = JSON.parse(outRaw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              out = /** @type {Record<string, unknown>} */ (parsed);
            }
          } catch {
            out = {};
          }
        }
        if (!storeId) storeId = str(out.storeId);
        if (!storeName) {
          storeName =
            str(out.storeName) ||
            str(out.businessName) ||
            str(out.title) ||
            str(out.storeTitle);
        }
        for (const k of Object.keys(out)) {
          if (k.startsWith('_')) continue;
          if (['storeId', 'storeName', 'businessName', 'title', 'storeTitle', 'draftId', 'generationRunId', 'jobId'].includes(k)) {
            continue;
          }
          if (out[k] != null && typeof out[k] === 'object') {
            toolsDone.add(k);
          }
        }
      }
    }

    const rows = await loadRecentBlackboardRows(mid, 20);
    for (const r of rows) {
      const et = str(r.eventType);
      const p = parsePayload(r.payload);

      const sid = str(p.storeId) || str(p.store_id);
      if (sid) storeId = sid;
      const sn =
        str(p.storeName) ||
        str(p.store_name) ||
        str(p.businessName) ||
        str(p.business_name) ||
        str(p.title);
      if (sn) storeName = sn;

      const tn =
        str(p.toolName) ||
        str(p.tool) ||
        str(p.recommendedTool) ||
        (et === 'step_output' ? str(p.stepTool) : '');
      if (tn && (et === 'step_output' || et === 'tool_call' || et === 'tool_result')) {
        toolsDone.add(tn);
      }

      if (et === 'completion_summary') {
        const sum = str(p.summary);
        if (sum) assetNotes.add(`completion: ${sum.slice(0, 120)}${sum.length > 120 ? '…' : ''}`);
      }

      if (et === 'blackboard_set' && str(p.key) === 'business.socialLinks') {
        const val = p.value && typeof p.value === 'object' ? p.value : {};
        const nets = Array.isArray(val.networks) ? val.networks.filter(Boolean).join(', ') : '';
        if (nets) assetNotes.add(`social links: ${nets}`);
      }
      if (et === 'next_action_hints') {
        const hints = Array.isArray(p.hints) ? p.hints : [];
        for (const h of hints) {
          if (!h || typeof h !== 'object') continue;
          const lb = str(/** @type {Record<string, unknown>} */ (h).label);
          const st = str(/** @type {Record<string, unknown>} */ (h).suggestedTool);
          if (lb || st) assetNotes.add([lb, st].filter(Boolean).join(' → '));
        }
      }

      collectUrls(p, urls, 10);
    }

    if (storeName || storeId) {
      if (storeName && storeId) lines.push(`Store: "${storeName}" (store_id: ${storeId})`);
      else if (storeName) lines.push(`Store: "${storeName}"`);
      else lines.push(`Store ID: ${storeId}`);
    }

    if (toolsDone.size) {
      lines.push(`Completed / recorded tools: ${[...toolsDone].join(', ')}`);
    }

    if (assetNotes.size) {
      lines.push(`Notes: ${[...assetNotes].slice(0, 6).join(' | ')}`);
    }

    if (urls.size) {
      const short = [...urls].map((u) => (u.length > 96 ? `${u.slice(0, 93)}…` : u));
      lines.push(`Asset URLs (sample): ${short.join('; ')}`);
    }

    if (pipelineStatus || pipelineRunState) {
      lines.push(`Pipeline status: ${pipelineStatus || 'unknown'}${pipelineRunState ? ` (runState: ${pipelineRunState})` : ''}`);
    }

    let summaryText = lines.join('\n');
    if (summaryText.length > MAX_CHARS) {
      summaryText = `${summaryText.slice(0, MAX_CHARS - 1)}…`;
    }
    return summaryText;
  } catch {
    return '';
  }
}
